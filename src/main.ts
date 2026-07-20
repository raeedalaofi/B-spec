// Entry point. For M3 this boots straight into a demo race; the career
// shell and menu screens arrive in M4.

import './ui/styles.css';
import { AI_DRIVERS } from './data/aidrivers';
import { CARS } from './data/cars';
import { TRACK_DEFS } from './data/tracks';
import { hashSeed } from './sim/rng';
import { compileTrack } from './sim/trackCompiler';
import type { RaceEntry } from './sim/types';
import { mountRaceScreen } from './ui/screens/race';

const app = document.querySelector<HTMLDivElement>('#app')!;

function startDemoRace(): void {
  const track = compileTrack(TRACK_DEFS.greenpark);
  const rookies = AI_DRIVERS.slice(0, 7);
  const carPool = ['kestrel', 'vulpe', 'taro', 'kestrel', 'vulpe', 'taro', 'kestrel'];
  const entries: RaceEntry[] = rookies.map((drv, i) => ({
    carId: `ai-${drv.id}`,
    spec: CARS[carPool[i]],
    driverName: drv.name,
    stats: drv.stats,
    isPlayer: false,
  }));
  entries.splice(5, 0, {
    carId: 'player',
    spec: CARS.vulpe,
    driverName: 'A. Driver',
    stats: { pace: 45, consistency: 42, battle: 40, smoothness: 44, stamina: 48 },
    isPlayer: true,
  });

  const params = new URLSearchParams(location.search);
  const laps = Math.max(1, parseInt(params.get('laps') ?? '6', 10) || 6);
  const seedParam = params.get('seed');

  mountRaceScreen(app, {
    config: {
      track,
      lapsTotal: laps,
      seed: seedParam ? parseInt(seedParam, 10) : hashSeed(`demo-${Date.now()}`),
      entries,
    },
    title: 'B-Spec Demo Race',
    subtitle: `Green Park Circuit · ${laps} laps`,
    onFinished: () => startDemoRace(),
  });
}

startDemoRace();
