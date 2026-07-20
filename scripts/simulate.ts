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
import { AI_DRIVERS, AI_BY_ID } from '../src/data/aidrivers';
import { CHAMPIONSHIPS } from '../src/data/championships';
import { LICENSE_TRIALS } from '../src/data/licenses';
import { evaluateTrial, trialTrackDef } from '../src/state/trials';
import type { Command, DriverStats, RaceEntry, RaceEvent, RaceState, Track } from '../src/sim/types';

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
} else if (mode === 'career') {
  // Expected-player-path sweep: for each championship event, run N seeded
  // races with the intended car, tier-appropriate driver stats and an
  // actively-managed command policy. Flags events outside the target
  // win-rate band.
  const n = parseInt(args[1] ?? '40', 10);
  const tiers: Record<
    string,
    { carId: string; stats: DriverStats; perEvent?: Record<string, string> }
  > = {
    'sunday-cup': {
      carId: 'vulpe',
      stats: { pace: 42, consistency: 38, battle: 35, smoothness: 40, stamina: 45 },
    },
    clubman: {
      carId: 'kite',
      stats: { pace: 58, consistency: 52, battle: 46, smoothness: 50, stamina: 50 },
    },
    national: {
      carId: 'phantom',
      perEvent: { 'nc-3': 'arrow', 'nc-4': 'arrow', 'nc-5': 'arrow' },
      stats: { pace: 71, consistency: 65, battle: 58, smoothness: 58, stamina: 55 },
    },
  };

  for (const champ of CHAMPIONSHIPS) {
    const tier = tiers[champ.id];
    if (!tier) continue; // generated championships aren't part of the core path
    console.log(`\n=== ${champ.name} (player: ${CARS[tier.carId].name}) ===`);
    for (const event of champ.events) {
      const playerCarId = tier.perEvent?.[event.id] ?? tier.carId;
      const track = getTrack(event.trackId);
      let winSum = 0;
      let posSum = 0;
      let podiumSum = 0;
      for (let seed = 1; seed <= n; seed++) {
        const entries: RaceEntry[] = champ.aiDriverIds.map((driverId, i) => ({
          carId: `ai-${driverId}`,
          spec: CARS[event.aiCarIds[i]],
          driverName: AI_BY_ID[driverId].name,
          stats: AI_BY_ID[driverId].stats,
          isPlayer: false,
        }));
        entries.push({
          carId: 'player',
          spec: CARS[playerCarId],
          driverName: 'YOU',
          stats: tier.stats,
          isPlayer: true,
          paceCmd: 4,
        });
        const state = createRace({
          track,
          lapsTotal: event.laps,
          seed: seed * 60013 + event.id.length,
          entries,
        });
        // active management policy at 1 Hz
        let pitCalled = false;
        let guard = 0;
        while (state.phase !== 'finished' && guard++ < 200000) {
          const cmds: Command[] = [];
          if (state.tickCount % 10 === 0) {
            const me = state.cars.find((c) => c.isPlayer)!;
            const lapsRemaining = state.lapsTotal - me.lap + 1;
            if (!pitCalled && !me.pit && me.tireWear > 0.8 && lapsRemaining > 2) {
              cmds.push({ type: 'PIT', carId: 'player', tires: true, refuel: true });
              pitCalled = true;
            }
            const wantPace = me.tireWear > 0.92 ? 2 : 4;
            if (me.paceCmd !== wantPace)
              cmds.push({ type: 'SET_PACE', carId: 'player', level: wantPace as 2 | 4 });
            const wantOt = me.battle !== null;
            if (me.overtakeMode !== wantOt)
              cmds.push({ type: 'OVERTAKE_MODE', carId: 'player', on: wantOt });
            if (me.pit && !me.pit.tires) pitCalled = false;
          }
          tick(state, cmds);
        }
        const pos = buildResult(state).rows.find((r) => r.isPlayer)!.position;
        posSum += pos;
        if (pos === 1) winSum++;
        if (pos <= 3) podiumSum++;
      }
      const winPct = Math.round((winSum / n) * 100);
      const podPct = Math.round((podiumSum / n) * 100);
      const flag = winPct < 15 ? '  ⚠ TOO HARD' : winPct > 95 ? '  ⚠ TOO EASY' : '';
      console.log(
        `${event.id.padEnd(6)} ${event.name.padEnd(26)} [${playerCarId.padEnd(7)}] win ${String(winPct).padStart(3)}%  podium ${String(podPct).padStart(3)}%  avg P${(posSum / n).toFixed(2)}${flag}`,
      );
    }
  }
}

// eslint-disable-next-line no-constant-condition
if (mode === 'trials') {
  // License-trial achievability check: run every trial with the standard
  // actively-managed policy and tier-appropriate driver stats. A healthy
  // trial is gold-able with strong play and at least bronze with this bot.
  const tierStats: Record<string, DriverStats> = {
    b: { pace: 42, consistency: 38, battle: 35, smoothness: 40, stamina: 45 },
    a: { pace: 52, consistency: 48, battle: 44, smoothness: 46, stamina: 48 },
    ic: { pace: 60, consistency: 56, battle: 50, smoothness: 52, stamina: 52 },
    ia: { pace: 70, consistency: 64, battle: 58, smoothness: 58, stamina: 55 },
    s: { pace: 80, consistency: 74, battle: 68, smoothness: 64, stamina: 60 },
  };
  for (const trial of LICENSE_TRIALS) {
    const track = compileTrack(trialTrackDef(trial));
    const entries: RaceEntry[] = trial.ai.map(({ driverId, carId }, i) => ({
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
      paceCmd: 4,
    });
    const state = createRace({ track, lapsTotal: trial.laps, seed: trial.seed, entries });
    let pitCalled = false;
    let guard = 0;
    while (state.phase !== 'finished' && guard++ < 400000) {
      const cmds: Command[] = [];
      if (state.tickCount % 10 === 0) {
        const me = state.cars.find((c) => c.isPlayer)!;
        const lapsRemaining = state.lapsTotal - me.lap + 1;
        if (!pitCalled && !me.pit && me.tireWear > 0.8 && lapsRemaining > 2) {
          cmds.push({ type: 'PIT', carId: 'player', tires: true, refuel: true });
          pitCalled = true;
        }
        const wantPace = me.tireWear > 0.92 ? 2 : 4;
        if (me.paceCmd !== wantPace) cmds.push({ type: 'SET_PACE', carId: 'player', level: wantPace as 2 | 4 });
        const wantOt = me.battle !== null;
        if (me.overtakeMode !== wantOt) cmds.push({ type: 'OVERTAKE_MODE', carId: 'player', on: wantOt });
      }
      tick(state, cmds);
    }
    const grade = evaluateTrial(trial, buildResult(state), state);
    console.log(
      `${trial.id.padEnd(5)} ${trial.name.padEnd(22)} ${String(grade.medal ?? 'FAIL').padEnd(6)} ${grade.detail}`,
    );
  }
}
