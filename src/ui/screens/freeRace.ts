// Free Race setup: exhibition racing with any owned car on any track.
// No prizes, no points — a sandbox for testing builds and strategies.

import { CARS } from '../../data/cars';
import { TRACK_DEFS } from '../../data/tracks';
import { menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';
import type { FreeRaceConfig } from './careerRace';

const TIERS = [
  { value: 0, label: 'Rookies' },
  { value: 1, label: 'Pros' },
  { value: 2, label: 'Aces' },
];

export function freeRaceScreen(ctx: AppContext): void {
  const gs = ctx.gs!;
  const content = menuShell(ctx, 'Free Race', { backTo: 'home' });

  if (gs.ownedCarIds.length === 0) {
    content.innerHTML = `<p class="empty-note">You need a car first — visit the dealership.</p>`;
    return;
  }

  content.innerHTML = `
    <p class="hint-note">Exhibition racing — pick any owned car, track and rival tier.
    No prizes or B-Spec points; a sandbox for testing tuning builds and race strategy.</p>
    <div class="free-form">
      <label class="form-field">
        <span class="label">Your car</span>
        <select id="fr-car" class="text-input">
          ${gs.ownedCarIds
            .map((id) => `<option value="${id}" ${id === gs.activeCarId ? 'selected' : ''}>${CARS[id].name} (${CARS[id].class})</option>`)
            .join('')}
        </select>
      </label>
      <label class="form-field">
        <span class="label">Track</span>
        <select id="fr-track" class="text-input">
          ${Object.values(TRACK_DEFS)
            .map((t) => `<option value="${t.id}">${t.name}</option>`)
            .join('')}
        </select>
      </label>
      <label class="form-field">
        <span class="label">Laps</span>
        <select id="fr-laps" class="text-input">
          ${[3, 5, 8, 12, 16, 20].map((n) => `<option ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <label class="form-field">
        <span class="label">Rivals</span>
        <select id="fr-tier" class="text-input">
          ${TIERS.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
      </label>
      <button class="btn primary big" id="fr-go">Start Race</button>
    </div>`;

  content.querySelector('#fr-go')!.addEventListener('click', () => {
    const cfg: FreeRaceConfig = {
      carId: (content.querySelector('#fr-car') as HTMLSelectElement).value,
      trackId: (content.querySelector('#fr-track') as HTMLSelectElement).value,
      laps: parseInt((content.querySelector('#fr-laps') as HTMLSelectElement).value, 10),
      rivalTier: parseInt((content.querySelector('#fr-tier') as HTMLSelectElement).value, 10) as 0 | 1 | 2,
    };
    ctx.go('race', { free: cfg });
  });
}
