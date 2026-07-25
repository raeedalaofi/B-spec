// Scenario API client + batch runner for the B-Spec art pipeline.
// Ready-made platform models only. Verified against the live API (July 2026):
//   POST /v1/generate/custom/{modelId}   -> { job: { jobId, ... } }
//   GET  /v1/jobs/{jobId}                -> { job: { status, metadata.assetIds } }
//   GET  /v1/assets/{assetId}            -> { asset: { url } }
//
// Credentials from env only — NEVER hardcode or commit:
//   export SCENARIO_KEY=api_xxx SCENARIO_SECRET=xxx
//
// Usage:
//   node scripts/art/scenario.mjs models [filter]     # list platform models
//   node scripts/art/scenario.mjs pilot               # style-approval batch
//   node scripts/art/scenario.mjs batch <manifest>    # run any manifest

import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BASE = process.env.SCENARIO_API_BASE ?? 'https://api.cloud.scenario.com/v1';
const KEY = process.env.SCENARIO_KEY;
const SECRET = process.env.SCENARIO_SECRET;
const AUTH = 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64');

/**
 * Credentials are only required by the commands that actually call the API.
 * The check used to run at import time, which meant `validate` — the one
 * command whose whole point is to catch a broken manifest *before* spending
 * anything — could not run without a key either.
 */
function requireCredentials() {
  if (!KEY || !SECRET) {
    console.error('Set SCENARIO_KEY and SCENARIO_SECRET in the environment.');
    process.exit(1);
  }
}

/** resolved platform model ids per pipeline lane */
export const MODELS = {
  photo: 'model_bfl-flux-2-pro-editing', // FLUX 2 (Pro): car renders, portraits, props
  transparent: 'model_ideogram-v3-generate-transparent', // native-alpha icons/badges
  texture: 'model_bfl-flux-2-dev', // seamless tiles
  vector: 'model_ideogram-v3-generate-transparent', // flat badges/emblems lane
  removeBg: 'model_bria-remove-background', // clean matting (Photoroom as backup)
  upscale: 'model_recraft-crisp-upscale',
  // instruction-based img2img: re-views an approved render from another angle
  // while holding the body shape and paint. This is what makes {id}-topdown
  // the same car as {id}-studio instead of a separate roll of the dice.
  kontext: 'model_flux-kontext-editing',
};

async function api(pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${pathname} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

/**
 * All public platform models, following pagination.
 *
 * This used to fetch a single pageSize=100 page and return it. There are 607
 * models, so `models <filter>` reported anything past the first page as
 * absent — including every model this pipeline actually uses. A lookup that
 * answers "not found" when the answer is "found on page 4" is worse than no
 * lookup at all.
 */
export async function listModels() {
  const all = [];
  let cursor = null;
  for (let page = 0; page < 25; page++) {
    const q = `/models?privacy=public&pageSize=100${cursor ? `&paginationToken=${encodeURIComponent(cursor)}` : ''}`;
    const out = await api(q);
    const models = out.models ?? [];
    all.push(...models);
    cursor = out.nextPaginationToken ?? out.paginationToken ?? null;
    if (!cursor || !models.length) break;
  }
  return all;
}

async function waitJob(jobId) {
  for (let i = 0; i < 200; i++) {
    const { job } = await api(`/jobs/${jobId}`);
    if (job.status === 'success') return job;
    if (job.status === 'failure' || job.status === 'canceled') {
      throw new Error(`job ${jobId} ${job.status}: ${JSON.stringify(job.error ?? {}).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`job ${jobId} timed out`);
}

/** run any generation job; returns asset ids */
let cuSpent = 0;
const CU_MAX = Number(process.env.ART_MAX_CU ?? Infinity);

export async function generate(modelId, body) {
  if (cuSpent >= CU_MAX) throw new Error(`budget stop: ${cuSpent} CU >= ART_MAX_CU ${CU_MAX}`);
  const out = await api(`/generate/custom/${modelId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  cuSpent += out.creativeUnitsCost ?? out.job?.billing?.cuCost ?? 0;
  const job = await waitJob(out.job.jobId);
  const assets = job.metadata?.assetIds ?? [];
  if (!assets.length) throw new Error(`job ${out.job.jobId} produced no assets`);
  return assets;
}

/**
 * Upload a local image and return its asset id, so it can be handed to an
 * img2img model as a reference. The API wants a data URI on `image`.
 */
export async function uploadImage(filePath) {
  const b64 = (await readFile(filePath)).toString('base64');
  const out = await api('/assets', {
    method: 'POST',
    body: JSON.stringify({
      image: `data:image/png;base64,${b64}`,
      name: path.basename(filePath, '.png'),
    }),
  });
  return (out.asset ?? out).id;
}

export async function assetUrl(assetId) {
  const out = await api(`/assets/${assetId}`);
  return (out.asset ?? out).url;
}

export async function download(assetId, filePath) {
  const url = await assetUrl(assetId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
}

/** alpha cutout via the Ideogram Remove Background img2img model */
export async function removeBackground(assetId) {
  const bodies = [{ image: assetId }, { assetIds: [assetId] }, { imageAssetId: assetId }];
  let lastErr;
  for (const body of bodies) {
    try {
      const assets = await generate(MODELS.removeBg, body);
      return assets[0];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export const GLOBAL_NEGATIVE =
  'text, watermark, logo, letters, numbers, signature, frame, border, cartoon, anime, low-poly, blurry, oversaturated, extra wheels, deformed';

const MANIFEST_LOG = 'docs/art-manifest.csv';

async function logAccepted(row) {
  if (!existsSync(MANIFEST_LOG)) {
    await writeFile(MANIFEST_LOG, 'id,model,seed,date,prompt\n');
  }
  await appendFile(
    MANIFEST_LOG,
    `${row.id},${row.model},${row.seed ?? ''},${new Date().toISOString()},"${row.prompt.replaceAll('"', "'")}"\n`,
  );
}

/** cache so one source render is uploaded once, not once per derived view */
const uploadCache = new Map();
async function referenceFor(file) {
  if (!uploadCache.has(file)) uploadCache.set(file, await uploadImage(file));
  return uploadCache.get(file);
}

async function runEntry(entry, candidates) {
  const modelId = MODELS[entry.modelSlot] ?? entry.modelSlot;
  const want = entry.candidates ?? candidates;
  // img2img entries derive from an already-approved render on disk
  const reference = entry.referenceFile ? await referenceFor(entry.referenceFile) : null;
  // `numSamples` is accepted and then ignored by the FLUX editing model — it
  // returns exactly one asset however many you ask for, so asking for eight
  // candidates silently produced one. Candidates are separate calls, which
  // also makes the cost per candidate visible rather than hidden in a
  // parameter the API quietly drops.
  let written = 0;
  for (let i = 0; i < want; i++) {
    const assets = await generate(modelId, {
      prompt: entry.prompt,
      ...(reference
        ? { referenceImages: [reference], numOutputs: 1, aspectRatio: entry.aspectRatio ?? '1:1' }
        : {
            negativePrompt: entry.negative ?? GLOBAL_NEGATIVE,
            width: entry.width,
            height: entry.height,
          }),
      ...(entry.seed !== undefined ? { seed: entry.seed + i } : {}),
      ...(entry.extra ?? {}),
    });
    for (const asset of assets) {
      let assetId = asset;
      if (entry.alpha === 'remove-bg') {
        try {
          assetId = await removeBackground(assetId);
        } catch (e) {
          console.error(`  ${entry.id}: bg-removal failed (candidate ${i}): ${String(e).slice(0, 140)}`);
        }
      }
      const file = written === 0 ? entry.out : entry.out.replace('.png', `.alt${written}.png`);
      await download(assetId, file);
      // Kontext reliably returns the top-down view nose-down, and the renderer
      // expects nose-up (raceRenderer rotates by PI/2 on that assumption).
      // Rotating here is deterministic and free; arguing with the model about
      // which way is up is neither.
      if (entry.rotate) {
        const buf = await sharp(file).rotate(entry.rotate).png({ compressionLevel: 9 }).toBuffer();
        await writeFile(file, buf);
      }
      written++;
    }
  }
  await logAccepted({ id: entry.id, model: modelId, prompt: entry.prompt });
}

export async function runManifest(entries, { candidates = 1, concurrency = 4 } = {}) {
  const failures = [];
  const queue = [...entries];
  let done = 0;
  const worker = async () => {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      // skip files that already exist (resumable batches)
      if (existsSync(entry.out)) {
        done++;
        console.log(`[${done}/${entries.length}] SKIP (exists) ${entry.id}`);
        continue;
      }
      try {
        await runEntry(entry, candidates);
        done++;
        console.log(`[${done}/${entries.length}] OK ${entry.id}  (spent ${cuSpent} CU)`);
      } catch (e) {
        done++;
        console.error(`[${done}/${entries.length}] FAILED ${entry.id}: ${String(e).slice(0, 200)}`);
        failures.push(entry.id);
        if (String(e).includes('budget stop')) {
          queue.length = 0;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`\nbatch done: ${entries.length - failures.length}/${entries.length} ok, ${cuSpent} CU spent this run`);
  if (failures.length) {
    console.error(`failures: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------------ CLI

/**
 * Static checks on a manifest, run without touching the API.
 *
 * Both of the mistakes this catches were real, and both fail silently:
 * an entry with no `negative` quietly inherits GLOBAL_NEGATIVE (so a hardened
 * per-batch negative is dropped without a word), and an entry whose `out`
 * already exists is skipped by runManifest — a regeneration batch pointed at
 * the live masters prints "SKIP (exists)" for every car and spends nothing
 * while looking like it ran.
 */
function validateManifest(entries) {
  const problems = [];
  const notes = [];
  const seen = new Set();
  let existing = 0;
  for (const e of entries) {
    const where = e.id ?? e.out ?? '(unnamed)';
    for (const field of ['id', 'out', 'modelSlot', 'prompt']) {
      if (!e[field]) problems.push(`${where}: missing '${field}'`);
    }
    if (e.modelSlot && !MODELS[e.modelSlot] && !String(e.modelSlot).startsWith('model_')) {
      problems.push(`${where}: unknown modelSlot '${e.modelSlot}' (not in MODELS, not a model_ id)`);
    }
    // img2img entries steer with the reference image and the instruction; the
    // Kontext model takes no negativePrompt, so requiring one here would be noise
    if (!e.negative && !e.referenceFile) {
      problems.push(`${where}: no 'negative' — will silently fall back to GLOBAL_NEGATIVE`);
    }
    if (e.referenceFile && !existsSync(e.referenceFile)) {
      problems.push(`${where}: referenceFile '${e.referenceFile}' does not exist`);
    }
    if (e.out && existsSync(e.out)) existing++;
    if (e.out && seen.has(e.out)) problems.push(`${where}: duplicate out '${e.out}'`);
    seen.add(e.out);
  }
  // Skipping *some* entries is how a batch resumes after a failure, so that is
  // a note rather than a fault. Skipping *every* entry is the silent no-op this
  // check exists to catch — a regeneration manifest still pointed at the live
  // masters prints "SKIP (exists)" for everything and spends nothing.
  if (existing && existing === entries.length) {
    problems.push(
      `all ${entries.length} outputs already exist — this batch would skip everything and generate nothing. ` +
        `Point 'out' somewhere new, or delete the existing files to regenerate.`,
    );
  } else if (existing) {
    notes.push(`${existing} of ${entries.length} outputs already exist and will be skipped (resume)`);
  }
  return { problems, notes };
}

const [, , cmd, arg] = process.argv;

if (cmd === 'models') {
  requireCredentials();
  const models = await listModels();
  const filter = (arg ?? '').toLowerCase();
  for (const m of models) {
    const line = `${m.id}  |  ${m.name ?? ''}`;
    if (!filter || line.toLowerCase().includes(filter)) console.log(line);
  }
} else if (cmd === 'validate') {
  const { entries, candidatesPerCar } = JSON.parse(await readFile(arg, 'utf8'));
  const { problems, notes } = validateManifest(entries);
  for (const n of notes) console.log(`  note: ${n}`);
  for (const p of problems) console.error(`  ${p}`);
  const perEntry = entries.reduce((n, e) => n + (e.candidates ?? candidatesPerCar ?? 1), 0);
  console.log(
    `\n${entries.length} entries, ${perEntry} candidate images total` +
      `${problems.length ? `, ${problems.length} problem(s)` : ', no problems'}`,
  );
  if (problems.length) process.exitCode = 1;
} else if (cmd === 'pilot' || cmd === 'batch') {
  requireCredentials();
  const manifestPath = cmd === 'pilot' ? 'scripts/art/manifest-pilot.json' : arg;
  const { entries } = JSON.parse(await readFile(manifestPath, 'utf8'));
  // never start a paid batch on a manifest that cannot work
  const { problems, notes } = validateManifest(entries);
  for (const n of notes) console.log(`  note: ${n}`);
  if (problems.length) {
    for (const p of problems) console.error(`  ${p}`);
    console.error(`\nrefusing to run: ${problems.length} manifest problem(s). Fix these first.`);
    process.exit(1);
  }
  await runManifest(entries);
} else {
  console.log(
    'usage: node scripts/art/scenario.mjs models [filter] | validate <manifest.json> | pilot | batch <manifest.json>',
  );
}
