// Headless race harness. Runs the pure sim from Node for development,
// verification and balancing.
//
// Single car:  npx tsx scripts/simulate.ts single [track] [car] [laps] [pace] [seed]
// Full race:   npx tsx scripts/simulate.ts race [track] [laps] [seed]
// Batch:       npx tsx scripts/simulate.ts batch [track] [laps] [nSeeds]

import { buildResult, createRace, raceOrder, tick, TICK_S } from '../src/sim/engine';
import { compileTrack } from '../src/sim/trackCompiler';
import { CARS } from '../src/data/cars';
import { TRACK_DEFS } from '../src/data/tracks';
import { AI_DRIVERS } from '../src/data/aidrivers';
import type { RaceEntry, RaceEvent, RaceState, Track } from '../src/sim/types';

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
  const maxTicks = 3 * 60 * 60 * 10; // 3 hours of sim time, hard stop
  let ticks = 0;
  while (state.phase !== 'finished' && ticks++ < maxTicks) {
    for (const e of tick(state, [])) onEvent?.(e, state);
  }
}

function demoEntries(
  trackForField: 'even' | 'mixed',
  seedOffset: number,
  playerPace: 1 | 2 | 3 | 4 | 5 = 3,
): RaceEntry[] {
  // 8-car field: player mid-grid in a vulpe, AI in class C machinery
  const carPool = ['kestrel', 'vulpe', 'taro', 'kestrel', 'vulpe', 'taro', 'kestrel'];
  const entries: RaceEntry[] = [];
  const rookies = AI_DRIVERS.slice(0, 7); // one skill tier, fair comparison
  for (let i = 0; i < 7; i++) {
    const drv = rookies[(i + seedOffset) % rookies.length];
    entries.push({
      carId: `ai-${drv.id}`,
      spec: CARS[trackForField === 'even' ? 'vulpe' : carPool[i]],
      driverName: drv.name,
      stats: drv.stats,
      isPlayer: false,
    });
  }
  entries.splice(4, 0, {
    carId: 'player',
    spec: CARS.vulpe,
    driverName: 'YOU',
    stats: { pace: 50, consistency: 50, battle: 50, smoothness: 50, stamina: 50 },
    isPlayer: true,
    paceCmd: playerPace,
  });
  return entries;
}

if (mode === 'single') {
  const [, trackId = 'greenpark', carId = 'vulpe', lapsArg = '8', paceArg = '3', seedArg = '42'] = args;
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
        stats: { pace: 50, consistency: 50, battle: 50, smoothness: 50, stamina: 50 },
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
  const state = createRace({
    track,
    lapsTotal: parseInt(lapsArg, 10),
    seed: parseInt(seedArg, 10),
    entries: demoEntries('even', parseInt(seedArg, 10) % 7),
  });
  const name = (id: string): string =>
    state.cars.find((c) => c.carId === id)?.driverName ?? id;
  runRace(state, (e, s) => {
    const t = fmt(s.raceTime);
    switch (e.type) {
      case 'OVERTAKE':
        console.log(`${t}  ${name(e.carId)} passes ${name(e.passedId)} for P${e.forPosition} (${e.zoneName})`);
        break;
      case 'OVERTAKE_ATTEMPT_FAILED':
        console.log(`${t}  ${name(e.carId)} lunges at ${name(e.defenderId)} — no way through`);
        break;
      case 'MISTAKE':
        console.log(`${t}  ${name(e.carId)} ${e.severity === 'spin' ? 'SPINS' : `${e.severity} mistake`} at ${e.cornerName}`);
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
  const track = getTrack(trackId);
  const n = parseInt(nArg, 10);
  const playerPace = Math.max(1, Math.min(5, parseInt(playerPaceArg, 10))) as 1 | 2 | 3 | 4 | 5;
  let totalPasses = 0;
  let minPasses = Infinity;
  let maxPasses = 0;
  const winners = new Map<string, number>();
  let playerSum = 0;
  for (let seed = 1; seed <= n; seed++) {
    const state = createRace({
      track,
      lapsTotal: parseInt(lapsArg, 10),
      seed: seed * 7919,
      entries: demoEntries('even', seed % 7, playerPace),
    });
    let passes = 0;
    runRace(state, (e) => {
      if (e.type === 'OVERTAKE') passes++;
    });
    totalPasses += passes;
    minPasses = Math.min(minPasses, passes);
    maxPasses = Math.max(maxPasses, passes);
    const result = buildResult(state);
    const w = result.rows[0];
    winners.set(w.driverName, (winners.get(w.driverName) ?? 0) + 1);
    playerSum += result.rows.find((r) => r.isPlayer)!.position;
    void TICK_S;
  }
  console.log(`${n} races on ${track.def.name}:`);
  console.log(`passes/race: avg ${(totalPasses / n).toFixed(1)} min ${minPasses} max ${maxPasses}`);
  console.log(`player avg position: ${(playerSum / n).toFixed(2)} (equal cars, 50-stat driver, grid P5)`);
  console.log(`winners: ${[...winners.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);
  void raceOrder;
}
