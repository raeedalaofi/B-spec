// Per-car tuning shop: buy parts stage by stage; the effective spec the
// sim will race with is shown live.

import { CARS } from '../../data/cars';
import {
  activeParts,
  nextPartInCategory,
  PART_BY_ID,
  PART_CATEGORIES,
  partPrice,
  tunedSpec,
} from '../../data/parts';
import { fmtCr, menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';
import { evaluateAchievements } from '../../state/achievements';
import { showAchievementToasts } from '../toasts';

export function tuningScreen(ctx: AppContext, params?: unknown): void {
  const gs = ctx.gs!;
  const { carId } = params as { carId: string };
  const car = CARS[carId];
  const installed = gs.tuning[carId] ?? [];
  const effective = tunedSpec(car, installed);
  const content = menuShell(ctx, `Tune — ${car.name}`, { backTo: 'garage' });

  const specRow = (
    label: string,
    base: string,
    now: string,
    changed: boolean,
  ): string => `
    <div class="spec-row${changed ? ' changed' : ''}">
      <span class="label">${label}</span>
      <span class="mono">${base}</span>
      <span class="mono arrow">${changed ? '→' : ''}</span>
      <span class="mono now">${changed ? now : ''}</span>
    </div>`;

  content.innerHTML = `
    <div class="tuning-layout">
      <div>
        <h2 class="section-title">Parts</h2>
        <div class="parts-list">
          ${PART_CATEGORIES.map(({ id, label }) => {
            const active = activeParts(installed).find((p) => p.category === id);
            const next = nextPartInCategory(id, installed);
            const price = next ? partPrice(car, next) : 0;
            const affordable = next !== null && gs.credits >= price;
            return `
              <div class="part-card">
                <div class="part-info">
                  <b>${label}</b>
                  <span class="label">${active ? `Installed: ${active.name}` : 'Stock'}</span>
                  ${next ? `<span class="part-desc">Next: ${next.name} — ${next.desc}</span>` : '<span class="part-desc maxed">Fully upgraded</span>'}
                </div>
                <div class="car-buy">
                  ${
                    next
                      ? `<span class="car-price">${fmtCr(price)}</span>
                         <button class="btn primary" data-part="${next.id}" ${affordable ? '' : 'disabled'}>Install</button>`
                      : '<span class="owned-tag">MAX</span>'
                  }
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
      <div>
        <h2 class="section-title">Specification</h2>
        <div class="spec-sheet">
          ${specRow('Power', `${car.powerKw} kW`, `${effective.powerKw} kW`, effective.powerKw !== car.powerKw)}
          ${specRow('Weight', `${car.massKg} kg`, `${effective.massKg} kg`, effective.massKg !== car.massKg)}
          ${specRow('Grip', car.grip.toFixed(2), effective.grip.toFixed(2), effective.grip !== car.grip)}
          ${specRow('Top speed', `${Math.round(car.topSpeedMs * 3.6)} km/h`, `${Math.round(effective.topSpeedMs * 3.6)} km/h`, Math.round(effective.topSpeedMs) !== Math.round(car.topSpeedMs))}
          ${specRow('Tire wear', `×${car.tireWearMult.toFixed(2)}`, `×${effective.tireWearMult.toFixed(2)}`, effective.tireWearMult !== car.tireWearMult)}
          ${specRow('Fuel use', `×${car.fuelMult.toFixed(2)}`, `×${effective.fuelMult.toFixed(2)}`, effective.fuelMult !== car.fuelMult)}
        </div>
        <p class="hint-note">Installed parts stay with the car. Selling the car forfeits its parts.
        Tuning does not change the car's class — a fully-built entry car can embarrass
        much more expensive machinery.</p>
      </div>
    </div>`;

  content.querySelectorAll<HTMLButtonElement>('[data-part]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const part = PART_BY_ID[btn.dataset.part!];
      const price = partPrice(car, part);
      if (gs.credits < price) return;
      gs.credits -= price;
      if (!gs.tuning[carId]) gs.tuning[carId] = [];
      gs.tuning[carId].push(part.id);
      const unlocked = evaluateAchievements(gs, { type: 'purchase' });
      ctx.save();
      showAchievementToasts(unlocked);
      ctx.go('tuning', { carId });
    }),
  );
}
