// Scenario API client + batch runner for the B-Spec art pipeline.
// Ready-made platform models only (no custom training).
//
// Credentials come from the environment — NEVER hardcode or commit them:
//   export SCENARIO_KEY=api_xxx
//   export SCENARIO_SECRET=xxx
//
// Usage:
//   node scripts/art/scenario.mjs models                 # list usable platform models
//   node scripts/art/scenario.mjs pilot                  # generate the pilot batch
//   node scripts/art/scenario.mjs batch manifest.json    # run any manifest
//
// Every accepted image is saved under public/assets/... and logged to
// docs/art-manifest.csv (id, model, prompt, seed, date) so any asset can be
// re-generated consistently later.

import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.SCENARIO_API_BASE ?? 'https://api.cloud.scenario.com/v1';
const KEY = process.env.SCENARIO_KEY;
const SECRET = process.env.SCENARIO_SECRET;
if (!KEY || !SECRET) {
  console.error('Set SCENARIO_KEY and SCENARIO_SECRET in the environment.');
  process.exit(1);
}
const AUTH = 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64');

async function api(pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${pathname} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

// ---------------------------------------------------------------- models

export async function listModels() {
  // platform ("public") models — try the documented shapes, newest first
  const attempts = [
    '/models?privacy=public&pageSize=100',
    '/models?pageSize=100',
    '/platform-models',
  ];
  for (const p of attempts) {
    try {
      const out = await api(p);
      const models = out.models ?? out.data ?? out;
      if (Array.isArray(models) && models.length) return models;
    } catch (e) {
      console.error(`  (${p} failed: ${String(e).slice(0, 120)})`);
    }
  }
  throw new Error('could not list models — check API docs/endpoint');
}

// ------------------------------------------------------------- generation

async function pollInference(modelId, inferenceId) {
  for (let i = 0; i < 120; i++) {
    const out = await api(`/models/${encodeURIComponent(modelId)}/inferences/${inferenceId}`);
    const inf = out.inference ?? out;
    if (inf.status === 'succeeded') return inf;
    if (inf.status === 'failed') throw new Error(`inference failed: ${JSON.stringify(inf).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('inference timed out');
}

/**
 * Text-to-image on a platform model. Tries the inference-style endpoint,
 * falls back to the flat /generate endpoint shape.
 */
export async function txt2img({ modelId, prompt, negativePrompt, width, height, numSamples = 4, seed }) {
  const params = {
    type: 'txt2img',
    prompt,
    negativePrompt,
    width,
    height,
    numSamples,
    ...(seed !== undefined ? { seed } : {}),
  };
  try {
    const out = await api(`/models/${encodeURIComponent(modelId)}/inferences`, {
      method: 'POST',
      body: JSON.stringify({ parameters: params }),
    });
    const inf = out.inference ?? out;
    const done = inf.status === 'succeeded' ? inf : await pollInference(modelId, inf.id);
    return (done.images ?? []).map((im) => ({ url: im.url, seed: im.seed ?? done.parameters?.seed }));
  } catch (e) {
    // fallback: flat generate API
    const out = await api(`/generate/txt2img`, {
      method: 'POST',
      body: JSON.stringify({ modelId, ...params }),
    });
    const job = out.job ?? out.inference ?? out;
    if (Array.isArray(job.images)) return job.images.map((im) => ({ url: im.url ?? im, seed: im.seed }));
    throw e;
  }
}

export async function removeBackground(imageUrlOrAssetId) {
  const bodies = [
    { image: imageUrlOrAssetId, backgroundColor: 'transparent' },
    { assetId: imageUrlOrAssetId },
  ];
  for (const body of bodies) {
    for (const p of ['/images/erase-background', '/generate/remove-background']) {
      try {
        const out = await api(p, { method: 'POST', body: JSON.stringify(body) });
        const img = out.image ?? out.asset ?? out;
        if (img.url) return img.url;
      } catch {
        // try next shape
      }
    }
  }
  throw new Error('background removal endpoint mismatch — check API docs');
}

async function download(url, filePath) {
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
}

// -------------------------------------------------------------- manifest

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

/**
 * Runs a manifest: [{ id, out, modelSlot, prompt, width, height, alpha }]
 * modelSlot is resolved against resolved model ids (see slots below).
 */
export async function runManifest(entries, slots, { candidates = 4 } = {}) {
  for (const entry of entries) {
    const modelId = slots[entry.modelSlot];
    if (!modelId) {
      console.error(`SKIP ${entry.id}: no model resolved for slot '${entry.modelSlot}'`);
      continue;
    }
    console.log(`\n=== ${entry.id} (${entry.modelSlot} -> ${modelId})`);
    const images = await txt2img({
      modelId,
      prompt: entry.prompt,
      negativePrompt: entry.negative ?? GLOBAL_NEGATIVE,
      width: entry.width,
      height: entry.height,
      numSamples: candidates,
    });
    // save all candidates for review; the first is the provisional pick
    for (let i = 0; i < images.length; i++) {
      let url = images[i].url;
      if (entry.alpha === 'remove-bg') {
        try {
          url = await removeBackground(url);
        } catch (e) {
          console.error(`  bg-removal failed for candidate ${i}: ${e}`);
        }
      }
      const suffix = i === 0 ? '' : `.alt${i}`;
      const file = i === 0 ? entry.out : entry.out.replace('.png', `${suffix}.png`);
      await download(url, file);
      console.log(`  saved ${file}`);
    }
    await logAccepted({ id: entry.id, model: modelId, seed: images[0]?.seed, prompt: entry.prompt });
  }
}

export const GLOBAL_NEGATIVE =
  'text, watermark, logo, letters, numbers, signature, frame, border, cartoon, anime, low-poly, blurry, oversaturated, extra wheels, deformed';

// ------------------------------------------------------------------ CLI

const [, , cmd, arg] = process.argv;

if (cmd === 'models') {
  const models = await listModels();
  for (const m of models) {
    console.log(`${m.id ?? m.modelId}  |  ${m.name ?? ''}  |  ${m.type ?? m.category ?? ''}`);
  }
} else if (cmd === 'pilot' || cmd === 'batch') {
  const manifestPath = cmd === 'pilot' ? 'scripts/art/manifest-pilot.json' : arg;
  const { slots: slotPatterns, entries } = JSON.parse(await readFile(manifestPath, 'utf8'));
  const models = await listModels();
  const slots = {};
  for (const [slot, patterns] of Object.entries(slotPatterns)) {
    const hit = models.find((m) =>
      patterns.some((p) => `${m.id ?? ''} ${m.name ?? ''}`.toLowerCase().includes(p.toLowerCase())),
    );
    slots[slot] = hit?.id ?? hit?.modelId ?? null;
    console.log(`slot ${slot} -> ${slots[slot] ?? 'NOT FOUND (' + patterns.join('|') + ')'}`);
  }
  await runManifest(entries, slots);
} else {
  console.log('usage: node scripts/art/scenario.mjs models | pilot | batch <manifest.json>');
}
