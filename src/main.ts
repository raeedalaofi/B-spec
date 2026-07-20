// Entry point. The playable UI arrives in M3 — for now, prove the sim
// runs in the browser by logging a headless race to the console.

import { CARS } from './data/cars';
import { TRACK_DEFS } from './data/tracks';
import { createRace, tick } from './sim/engine';
import { compileTrack } from './sim/trackCompiler';

const track = compileTrack(TRACK_DEFS.greenpark);
const state = createRace({
  track,
  lapsTotal: 3,
  seed: 42,
  entries: [
    {
      carId: 'p1',
      spec: CARS.vulpe,
      driverName: 'Test Driver',
      stats: { pace: 50, consistency: 50, battle: 50, smoothness: 50, stamina: 50 },
      isPlayer: true,
    },
  ],
});
let guard = 0;
while (state.phase !== 'finished' && guard++ < 100000) tick(state, []);

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <h1>B-Spec</h1>
  <p>Sim smoke test: ${state.cars[0].driverName} — best lap
  ${state.cars[0].bestLapS?.toFixed(3)}s on ${track.def.name}.</p>
`;
