// Headless race harness. Runs the pure sim from Node for development,
// verification and balancing. Usage:
//   npx tsx scripts/simulate.ts [track] [car] [laps] [pace] [seed]
// e.g. npx tsx scripts/simulate.ts greenpark vulpe 8 3 42

import { createRace, tick, TICK_S } from '../src/sim/engine';
import { compileTrack } from '../src/sim/trackCompiler';
import { CARS } from '../src/data/cars';
import { TRACK_DEFS } from '../src/data/tracks';
import type { RaceEvent } from '../src/sim/types';

const [trackId = 'greenpark', carId = 'vulpe', lapsArg = '8', paceArg = '3', seedArg = '42'] =
  process.argv.slice(2);

const def = TRACK_DEFS[trackId];
if (!def) throw new Error(`unknown track '${trackId}' (${Object.keys(TRACK_DEFS).join(', ')})`);
const spec = CARS[carId];
if (!spec) throw new Error(`unknown car '${carId}' (${Object.keys(CARS).join(', ')})`);

const track = compileTrack(def);
console.log(`=== ${def.name} ===`);
console.log(`length: ${(track.lengthM / 1000).toFixed(3)} km, samples: ${track.samples.length}`);
console.log(
  `corners: ${track.corners
    .map((c) => `${c.name}@${Math.round(c.entryS)}m(${(c.apexSpeed * 3.6).toFixed(0)}km/h sev${c.severity.toFixed(2)})`)
    .join(' ')}`,
);
console.log(
  `overtake zones: ${track.overtakingZones
    .map((z) => `${z.name}[${Math.round(z.startS)}-${Math.round(z.endS)}m diff${z.difficulty.toFixed(2)}]`)
    .join(' ')}`,
);

const laps = parseInt(lapsArg, 10);
const pace = Math.max(1, Math.min(5, parseInt(paceArg, 10))) as 1 | 2 | 3 | 4 | 5;
const seed = parseInt(seedArg, 10);

const state = createRace({
  track,
  lapsTotal: laps,
  seed,
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
console.log(
  `\n${spec.name}: ideal lap ${fmt(car.idealLapS)} (top speed on lap: ${(car.profileMax * 3.6).toFixed(0)} km/h)`,
);
console.log(`running ${laps} laps at pace ${pace}, seed ${seed}\n`);

const events: RaceEvent[] = [];
let ticks = 0;
const maxTicks = (laps * car.idealLapS * 3 + 60) / TICK_S;
while (state.phase !== 'finished' && ticks < maxTicks) {
  events.push(...tick(state, []));
  ticks++;
}

for (const e of events) {
  if (e.type === 'LAP_COMPLETE') {
    console.log(
      `lap ${String(e.lap).padStart(2)}: ${fmt(e.lapTimeS)}${e.isPersonalBest ? ' PB' : ''}  wear ${(car.tireWear * 100).toFixed(0)}% fuel ${car.fuelL.toFixed(1)}L fatigue ${(car.fatigue * 100).toFixed(0)}%`,
    );
  } else if (e.type === 'MISTAKE') {
    console.log(`  !! ${e.severity} mistake at ${e.cornerName}`);
  } else if (e.type === 'PIT_IN' || e.type === 'PIT_OUT' || e.type === 'OUT_OF_FUEL') {
    console.log(`  -- ${e.type}`);
  }
}
console.log(`\nbest lap: ${car.bestLapS ? fmt(car.bestLapS) : '-'}, race time ${fmt(state.raceTime)}`);

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, '0')}`;
}
