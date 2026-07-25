// Headless race harness. Runs the pure sim from Node for development,
// verification and balancing.
//
// Inspection
//   npx tsx scripts/simulate.ts single [track] [car] [laps] [pace] [seed]
//   npx tsx scripts/simulate.ts race   [track] [laps] [seed]
//   npx tsx scripts/simulate.ts batch  [track] [laps] [nSeeds] [playerPace]
//
// Measurement (the balancing loop — see src/sim/metrics.ts for the targets)
//   npx tsx scripts/simulate.ts quality [nSeeds]      race-quality dashboard
//   npx tsx scripts/simulate.ts curve   [nSeeds]      career difficulty bands
//   npx tsx scripts/simulate.ts economy               can the path self-fund?
//   npx tsx scripts/simulate.ts agency  [nSeeds]      does play skill matter?
//   npx tsx scripts/simulate.ts trials                license achievability

import { buildResult, createRace, tick } from '../src/sim/engine';
import { measureRace, QUALITY_TARGETS, type RaceMetrics } from '../src/sim/metrics';
import { compileTrack } from '../src/sim/trackCompiler';
import { CARS } from '../src/data/cars';
import { TRACK_DEFS } from '../src/data/tracks';
import { AI_DRIVERS, AI_BY_ID } from '../src/data/aidrivers';
import { CHAMPIONSHIPS, CHAMPIONSHIP_BY_ID } from '../src/data/championships';
import {
  bandFor,
  CAREER_PATH,
  licenceIncomeUpTo,
  statsForEvent,
} from '../src/data/careerPath';
import { LICENSE_TRIALS } from '../src/data/licenses';
import { buildCost } from '../src/data/parts';
import { STARTING_CREDITS } from '../src/state/gameState';
import { evaluateTrial, trialTrackDef } from '../src/state/trials';
import {
  championshipRace,
  competentPolicy,
  evenRace,
  POLICIES,
  REFERENCE_TRACKS,
  stats,
  track as compiledTrack,
} from './fields';
import type { RaceEvent, RaceState, Track } from '../src/sim/types';

const args = process.argv.slice(2);
const mode = args[0] ?? 'single';

function getTrack(id: string): Track {
  const def = TRACK_DEFS[id];
  if (!def) throw new Error(`unknown track '${id}' (${Object.keys(TRACK_DEFS).join(', ')})`);
  return compileTrack(def);
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, '0')}`;
}

function money(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} Cr.`;
}

/** ✓ / ✗ against an inclusive band, for the measurement dashboards */
function band(value: number, min: number, max: number): string {
  return value >= min && value <= max ? '[32m✓[0m' : '[31m✗[0m';
}

function printTrack(track: Track): void {
  console.log(`=== ${track.def.name} ===`);
  console.log(`length: ${(track.lengthM / 1000).toFixed(3)} km`);
  console.log(
    `corners: ${track.corners
      .map((c) => `${c.name}@${Math.round(c.entryS)}m(${(c.apexSpeed * 3.6).toFixed(0)}km/h)`)
      .join(' ')}`,
  );
  console.log(
    `overtake zones: ${track.overtakingZones
      .map((z) => `${z.name}[${Math.round(z.startS)}-${Math.round(z.endS)}m]`)
      .join(' ')}\n`,
  );
}

function runRace(state: RaceState, onEvent?: (e: RaceEvent, s: RaceState) => void): void {
  const maxTicks = 3 * 60 * 60 * 10;
  let ticks = 0;
  while (state.phase !== 'finished' && ticks++ < maxTicks) {
    for (const e of tick(state, [])) onEvent?.(e, state);
  }
}

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

// ---------------------------------------------------------------------------

if (mode === 'single') {
  const [, trackId = 'greenpark', carId = 'vulpe', lapsArg = '8', paceArg = '3', seedArg = '42'] =
    args;
  const track = getTrack(trackId);
  printTrack(track);
  const spec = CARS[carId];
  if (!spec) throw new Error(`unknown car '${carId}'`);
  const pace = Math.max(1, Math.min(5, parseInt(paceArg, 10))) as 1 | 2 | 3 | 4 | 5;
  const state = createRace({
    track,
    lapsTotal: parseInt(lapsArg, 10),
    seed: parseInt(seedArg, 10),
    entries: [
      {
        carId: 'p1',
        spec,
        driverName: 'Test Driver',
        stats: stats(50, 50, 50, 50, 50),
        isPlayer: true,
        paceCmd: pace,
      },
    ],
  });
  const car = state.cars[0];
  console.log(`${spec.name}: ideal lap ${fmt(car.idealLapS)}\n`);
  runRace(state, (e) => {
    if (e.type === 'LAP_COMPLETE') {
      console.log(
        `lap ${String(e.lap).padStart(2)}: ${fmt(e.lapTimeS)}${e.isPersonalBest ? ' PB' : ''}  wear ${(car.tireWear * 100).toFixed(0)}% fuel ${car.fuelL.toFixed(1)}L`,
      );
    } else if (e.type === 'MISTAKE') {
      console.log(`  !! ${e.severity} at ${e.cornerName}`);
    }
  });
  console.log(`\nbest: ${car.bestLapS ? fmt(car.bestLapS) : '-'}, total ${fmt(state.raceTime)}`);
} else if (mode === 'race') {
  const [, trackId = 'greenpark', lapsArg = '8', seedArg = '42'] = args;
  const track = getTrack(trackId);
  printTrack(track);
  const seed = parseInt(seedArg, 10);
  const state = evenRace(trackId, parseInt(lapsArg, 10), seed);
  const name = (id: string): string =>
    state.cars.find((c) => c.carId === id)?.driverName ?? id;
  runRace(state, (e, s) => {
    const t = fmt(s.raceTime);
    switch (e.type) {
      case 'OVERTAKE':
        console.log(
          `${t}  ${name(e.carId)} passes ${name(e.passedId)} for P${e.forPosition} (${e.zoneName})`,
        );
        break;
      case 'OVERTAKE_ATTEMPT_FAILED':
        console.log(`${t}  ${name(e.carId)} lunges at ${name(e.defenderId)} — no way through`);
        break;
      case 'SIDE_BY_SIDE':
        console.log(`${t}  ${name(e.carId)} draws alongside ${name(e.defenderId)} (${e.zoneName})`);
        break;
      case 'MISTAKE':
        console.log(
          `${t}  ${name(e.carId)} ${e.severity === 'spin' ? 'SPINS' : `${e.severity} mistake`} at ${e.cornerName}`,
        );
        break;
      case 'RETIREMENT':
        console.log(`${t}  ${name(e.carId)} RETIRES (${e.reason})`);
        break;
      case 'PIT_IN':
        console.log(`${t}  ${name(e.carId)} pits`);
        break;
      case 'PIT_OUT':
        console.log(`${t}  ${name(e.carId)} rejoins (${e.stopTimeS?.toFixed(1)}s stop)`);
        break;
      case 'LAP_COMPLETE':
        if (e.isRaceFastest && e.lap > 1)
          console.log(`${t}  FASTEST LAP ${name(e.carId)} ${fmt(e.lapTimeS)}`);
        break;
      case 'FINISH':
        console.log(`${t}  ${name(e.carId)} finishes P${e.position}`);
        break;
    }
  });
  console.log('\n=== RESULT ===');
  const result = buildResult(state);
  for (const r of result.rows) {
    console.log(
      `P${r.position}  ${r.driverName.padEnd(14)} ${r.carName.padEnd(18)} ` +
        `${r.gapS === null ? 'DNF/lapped' : r.position === 1 ? fmt(state.cars.find((c) => c.carId === r.carId)!.finishTime!) : '+' + r.gapS.toFixed(3)} ` +
        `best ${r.bestLapS ? fmt(r.bestLapS) : '-'} ot ${r.overtakes} err ${r.mistakes}${r.fastestLap ? ' FL' : ''}`,
    );
  }
} else if (mode === 'batch') {
  const [, trackId = 'greenpark', lapsArg = '6', nArg = '30', playerPaceArg = '3'] = args;
  const n = parseInt(nArg, 10);
  const laps = parseInt(lapsArg, 10);
  const playerPace = Math.max(1, Math.min(5, parseInt(playerPaceArg, 10))) as 1 | 2 | 3 | 4 | 5;
  const winners = new Map<string, number>();
  const runs: RaceMetrics[] = [];
  let playerSum = 0;
  for (let seed = 1; seed <= n; seed++) {
    const m = measureRace(evenRace(trackId, laps, seed * 7919, playerPace));
    runs.push(m);
    const w = m.result.rows[0];
    winners.set(w.driverName, (winners.get(w.driverName) ?? 0) + 1);
    playerSum += m.result.rows.find((r) => r.isPlayer)!.position;
  }
  console.log(`${n} races on ${compiledTrack(trackId).def.name} (${laps} laps):`);
  console.log(
    `passes/race: avg ${avg(runs.map((r) => r.passes)).toFixed(1)} ` +
      `min ${Math.min(...runs.map((r) => r.passes))} max ${Math.max(...runs.map((r) => r.passes))}`,
  );
  console.log(`player avg position: ${(playerSum / n).toFixed(2)} (equal cars, 50-stat driver, grid P5)`);
  console.log(`winners: ${[...winners.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);
} else if (mode === 'quality') {
  // The race-quality dashboard. Every number here has a target band in
  // QUALITY_TARGETS; CI fails on the same thresholds via tests/quality.test.ts.
  const n = parseInt(args[1] ?? '8', 10);
  const laps: Record<string, number> = { greenpark: 6, oval: 10, aria: 8, kaiserwald: 5 };
  console.log(`Race quality — ${n} seeds per track, 8 identical cars, one skill tier\n`);
  console.log(
    'track        stuck%  maxStuck  bigTrain%  near%  passes  failed  convert%  lapSprd%  lateOT',
  );
  const all: RaceMetrics[] = [];
  for (const trackId of REFERENCE_TRACKS) {
    const runs: RaceMetrics[] = [];
    for (let seed = 1; seed <= n; seed++) {
      runs.push(measureRace(evenRace(trackId, laps[trackId] ?? 6, seed * 7919)));
    }
    all.push(...runs);
    const a = (f: (m: RaceMetrics) => number): number => avg(runs.map(f));
    console.log(
      `${trackId.padEnd(12)} ` +
        `${a((r) => r.stuckPct).toFixed(1).padStart(5)}${band(a((r) => r.stuckPct), 0, QUALITY_TARGETS.maxStuckPct)} ` +
        `${a((r) => r.maxStuckS).toFixed(0).padStart(7)}${band(a((r) => r.maxStuckS), 0, QUALITY_TARGETS.maxStuckS)} ` +
        `${a((r) => r.bigTrainPct).toFixed(1).padStart(8)}${band(a((r) => r.bigTrainPct), 0, QUALITY_TARGETS.maxBigTrainPct)} ` +
        `${a((r) => r.trainPct).toFixed(1).padStart(5)} ` +
        `${a((r) => r.passes).toFixed(1).padStart(7)} ` +
        `${a((r) => r.failedAttempts).toFixed(1).padStart(7)} ` +
        `${a((r) => r.conversionPct).toFixed(1).padStart(8)}${band(a((r) => r.conversionPct), QUALITY_TARGETS.minConversionPct, QUALITY_TARGETS.maxConversionPct)} ` +
        `${a((r) => r.bestLapSpreadPct).toFixed(2).padStart(9)}${band(a((r) => r.bestLapSpreadPct), 0, QUALITY_TARGETS.maxBestLapSpreadPct)} ` +
        `${a((r) => r.lateOvertakes).toFixed(1).padStart(6)}`,
    );
  }
  const g = (f: (m: RaceMetrics) => number): number => avg(all.map(f));
  console.log(
    `\noverall: stuck ${g((r) => r.stuckPct).toFixed(1)}% (target <${QUALITY_TARGETS.maxStuckPct}%) · ` +
      `convert ${g((r) => r.conversionPct).toFixed(1)}% (target ${QUALITY_TARGETS.minConversionPct}-${QUALITY_TARGETS.maxConversionPct}%) · ` +
      `lap spread ${g((r) => r.bestLapSpreadPct).toFixed(2)}% (target <${QUALITY_TARGETS.maxBestLapSpreadPct}%)`,
  );
} else if (mode === 'curve') {
  // Career difficulty sweep against the intended player path. Every event
  // should land inside the band declared in src/data/careerPath.ts.
  const n = parseInt(args[1] ?? '30', 10);
  const csv = args.includes('--csv');
  if (csv) console.log('championship,event,car,winPct,podiumPct,avgPos,bandMin,bandMax,inBand');
  let outOfBand = 0;
  for (const tier of CAREER_PATH) {
    const champ = CHAMPIONSHIP_BY_ID[tier.championshipId];
    if (!csv) console.log(`\n=== ${champ.name} (player: ${CARS[tier.carId].name}) ===`);
    champ.events.forEach((event, idx) => {
      const carId = tier.perEvent?.[event.id] ?? tier.carId;
      const target = bandFor(tier, idx, champ.events.length);
      let wins = 0;
      let podiums = 0;
      let posSum = 0;
      for (let seed = 1; seed <= n; seed++) {
        const state = championshipRace(
          event.trackId,
          event.laps,
          seed * 60013 + event.id.length,
          champ.aiDriverIds,
          event.aiCarIds,
          carId,
          statsForEvent(tier, idx, champ.events.length),
          tier.parts,
          event.aiParts ?? champ.aiParts ?? [],
        );
        const m = measureRace(state, competentPolicy());
        const pos = m.result.rows.find((r) => r.isPlayer)!.position;
        posSum += pos;
        if (pos === 1) wins++;
        if (pos <= 3) podiums++;
      }
      const winPct = Math.round((wins / n) * 100);
      const podPct = Math.round((podiums / n) * 100);
      const ok = winPct >= target.min && winPct <= target.max;
      if (!ok) outOfBand++;
      if (csv) {
        console.log(
          `${champ.id},${event.id},${carId},${winPct},${podPct},${(posSum / n).toFixed(2)},${target.min},${target.max},${ok}`,
        );
      } else {
        console.log(
          `${event.id.padEnd(6)} ${event.name.padEnd(26)} [${carId.padEnd(7)}] ` +
            `win ${String(winPct).padStart(3)}%  podium ${String(podPct).padStart(3)}%  ` +
            `avg P${(posSum / n).toFixed(2)}  target ${target.min}-${target.max}% ` +
            `${band(winPct, target.min, target.max)}`,
        );
      }
    });
  }
  if (!csv) {
    console.log(
      outOfBand === 0
        ? '\nAll core events inside their target bands.'
        : `\n${outOfBand} event(s) outside their target band.`,
    );
  }
} else if (mode === 'agency') {
  // Does the game reward deciding? Runs every distinct way of playing each
  // event and reports two things: how much the best approach beats simply
  // leaving the car alone, and whether the best approach changes race to
  // race. A big gap with one always-winning policy is not a decision space,
  // it is a dominant strategy wearing a costume.
  const n = parseInt(args[1] ?? '20', 10);
  console.log(`Player agency — ${n} seeds per event, ${POLICIES.length} approaches\n`);
  console.log(
    `event    ${POLICIES.map((p) => p.name.padStart(9)).join('')}    best        gain`,
  );
  const gains: number[] = [];
  const winners = new Map<string, number>();
  for (const tier of CAREER_PATH) {
    const champ = CHAMPIONSHIP_BY_ID[tier.championshipId];
    champ.events.forEach((event, idx) => {
      const carId = tier.perEvent?.[event.id] ?? tier.carId;
      const scores = POLICIES.map((policy) => {
        let sum = 0;
        for (let seed = 1; seed <= n; seed++) {
          const state = championshipRace(
            event.trackId,
            event.laps,
            seed * 60013 + event.id.length,
            champ.aiDriverIds,
            event.aiCarIds,
            carId,
            statsForEvent(tier, idx, champ.events.length),
            tier.parts,
            event.aiParts ?? champ.aiParts ?? [],
          );
          sum += measureRace(state, policy.make()).result.rows.find((r) => r.isPlayer)!.position;
        }
        return sum / n;
      });
      const bestIdx = scores.indexOf(Math.min(...scores));
      const gain = scores[0] - scores[bestIdx];
      gains.push(gain);
      winners.set(POLICIES[bestIdx].name, (winners.get(POLICIES[bestIdx].name) ?? 0) + 1);
      console.log(
        `${event.id.padEnd(8)} ${scores.map((v) => v.toFixed(2).padStart(9)).join('')}` +
          `  ${POLICIES[bestIdx].name.padEnd(9)} ${gain >= 0 ? '+' : ''}${gain.toFixed(2)}`,
      );
    });
  }
  const mean = avg(gains);
  const distinct = winners.size;
  console.log(
    `\nbest approach beats leaving it alone by ${mean.toFixed(2)} positions on average ` +
      `${mean >= 0.6 ? '\u001b[32m✓\u001b[0m' : '\u001b[31m✗\u001b[0m'}`,
  );
  console.log(
    `winning approach by event: ${[...winners.entries()].map(([k, v]) => `${k}:${v}`).join(' ')} ` +
      `${distinct >= 3 ? '\u001b[32m✓ no dominant strategy\u001b[0m' : '\u001b[31m✗ one approach dominates\u001b[0m'}`,
  );
} else if (mode === 'economy') {
  // Can the intended path fund itself? Walks the core ladder: earn the
  // licence the tier requires, arrive able to afford the car *and* the build
  // the difficulty sweep assumes, then bank the prize money.
  //
  // Simplification worth knowing about: this counts the tier's primary car
  // only. A player who also buys the mid-championship upgrade car pays more,
  // and does so out of that championship's own prize money.
  console.log('Career economy — intended path, prizes at the target finishing rate\n');
  let credits = STARTING_CREDITS;
  console.log(`start${' '.repeat(37)}${money(credits).padStart(14)}`);
  let ok = true;
  let licencesHeld: string[] = [];
  for (const tier of CAREER_PATH) {
    const champ = CHAMPIONSHIP_BY_ID[tier.championshipId];
    const car = CARS[tier.carId];

    if (champ.licenseReq && !licencesHeld.includes(champ.licenseReq)) {
      const held = licencesHeld.length
        ? licenceIncomeUpTo(licencesHeld[licencesHeld.length - 1] as never)
        : 0;
      const net = licenceIncomeUpTo(champ.licenseReq) - held;
      credits += net;
      licencesHeld = [...licencesHeld, champ.licenseReq];
      console.log(
        `  ${champ.licenseReq.toUpperCase().padEnd(3)} licence trials      +${money(net).padStart(13)}  → ${money(credits)}`,
      );
    }

    const build = buildCost(car, tier.parts);
    const needed = car.priceCr + build;
    if (credits < needed) {
      ok = false;
      console.log(
        `\u001b[31m  short ${money(needed - credits)} for ${car.name} + build (${money(needed)})\u001b[0m`,
      );
    }
    credits -= needed;
    console.log(
      `buy ${car.name.padEnd(20)} -${money(car.priceCr).padStart(13)}  → ${money(credits + build)}`,
    );
    console.log(`  build to spec             -${money(build).padStart(13)}  → ${money(credits)}`);

    // assume the player finishes inside their band: model as P2 average
    const earned = champ.prize[1] * champ.events.length + champ.titleBonus * 0.5;
    credits += earned;
    console.log(
      `  ${champ.name.padEnd(24)} +${money(earned).padStart(13)}  → ${money(credits)}`,
    );
  }
  console.log(
    `\n${ok ? '\u001b[32m✓ the core ladder self-funds\u001b[0m' : '\u001b[31m✗ the player must grind to progress\u001b[0m'}`,
  );
} else if (mode === 'trials') {
  const tierStats: Record<string, ReturnType<typeof stats>> = {
    b: stats(42, 38, 35, 40, 45, 45),
    a: stats(52, 48, 44, 46, 48, 50),
    ic: stats(60, 56, 50, 52, 52, 54),
    ia: stats(70, 64, 58, 58, 55, 58),
    s: stats(80, 74, 68, 64, 60, 64),
  };
  for (const trial of LICENSE_TRIALS) {
    const track = compileTrack(trialTrackDef(trial));
    const entries = trial.ai.map(({ driverId, carId }, i) => ({
      carId: `ai-${driverId}-${i}`,
      spec: CARS[carId],
      driverName: AI_BY_ID[driverId].name,
      stats: AI_BY_ID[driverId].stats,
      isPlayer: false,
    }));
    entries.push({
      carId: 'player',
      spec: CARS[trial.carId],
      driverName: 'BOT',
      stats: tierStats[trial.licenseId ?? 'b'],
      isPlayer: true,
    });
    const state = createRace({ track, lapsTotal: trial.laps, seed: trial.seed, entries });
    const m = measureRace(state, competentPolicy());
    const grade = evaluateTrial(trial, m.result, state);
    console.log(
      `${trial.id.padEnd(5)} ${trial.name.padEnd(22)} ${String(grade.medal ?? 'FAIL').padEnd(6)} ${grade.detail}`,
    );
  }
} else if (mode === 'drivers') {
  console.log('AI roster\n');
  for (const d of AI_DRIVERS) {
    const s = d.stats;
    console.log(
      `${d.id.padEnd(11)} ${d.name.padEnd(14)} ${d.trait.padEnd(11)} ` +
        `pace ${s.pace} cons ${s.consistency} battle ${s.battle} ` +
        `smooth ${s.smoothness} stam ${s.stamina} aggr ${s.aggression}`,
    );
  }
} else {
  console.log(`unknown mode '${mode}'. See the header of this file for usage.`);
  void CHAMPIONSHIPS;
}
