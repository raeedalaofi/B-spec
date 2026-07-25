import { CARS } from '../../data/cars';
import { activeParts, tunedSpec } from '../../data/parts';
import { imgTag } from '../assets';
import { confirmDialog } from '../dialog';
import { fmtCr, menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';

export function garageScreen(ctx: AppContext): void {
  const gs = ctx.gs!;
  const content = menuShell(ctx, 'Garage', { backTo: 'home' });

  if (gs.ownedCarIds.length === 0) {
    content.innerHTML = `
      <p class="empty-note">Your garage is empty. Visit the dealership to buy your first car.</p>
      <button class="btn primary" id="to-dealer">Go to Dealership</button>`;
    content.querySelector('#to-dealer')!.addEventListener('click', () => ctx.go('dealership'));
    return;
  }

  content.innerHTML = `<div class="car-list">${gs.ownedCarIds
    .map((id) => {
      const car = CARS[id];
      const parts = gs.tuning[id] ?? [];
      const eff = tunedSpec(car, parts);
      const tunedCount = activeParts(parts).length;
      const active = gs.activeCarId === id;
      const sellPrice = Math.round(car.priceCr * 0.6);
      const kmh = Math.round(eff.topSpeedMs * 3.6);
      return `
        <div class="car-card ${active ? 'active-car' : ''}">
          ${imgTag(`cars/${id}-studio.png`, 'car-thumb', car.name)}
          <div class="car-chip" style="background:${car.color}"></div>
          <div class="car-info">
            <b>${car.name} ${active ? '<span class="active-tag">ACTIVE</span>' : ''}
              ${tunedCount > 0 ? `<span class="tuned-tag">TUNED ×${tunedCount}</span>` : ''}</b>
            <span class="label">Class ${car.class}</span>
            <span class="car-specs">${eff.powerKw} kW · ${eff.massKg} kg · ${kmh} km/h · grip ${eff.grip.toFixed(2)}</span>
          </div>
          <div class="car-buy">
            <button class="btn" data-tune="${id}">Tune</button>
            ${active ? '' : `<button class="btn primary" data-select="${id}">Select</button>`}
            ${
              gs.ownedCarIds.length > 1 && !active
                ? `<button class="btn" data-sell="${id}">Sell ${fmtCr(sellPrice)}</button>`
                : ''
            }
          </div>
        </div>`;
    })
    .join('')}</div>`;

  content.querySelectorAll<HTMLButtonElement>('[data-select]').forEach((btn) =>
    btn.addEventListener('click', () => {
      gs.activeCarId = btn.dataset.select!;
      ctx.save();
      ctx.go('garage');
    }),
  );
  content.querySelectorAll<HTMLButtonElement>('[data-tune]').forEach((btn) =>
    btn.addEventListener('click', () => ctx.go('tuning', { carId: btn.dataset.tune })),
  );
  content.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.sell!;
      const car = CARS[id];
      const hasParts = (gs.tuning[id] ?? []).length > 0;
      const warn = hasParts ? ' Installed tuning parts will be lost.' : '';
      const ok = await confirmDialog({
        title: `Sell the ${car.name}?`,
        body: `You will receive ${fmtCr(Math.round(car.priceCr * 0.6))}.${warn}`,
        confirmLabel: 'Sell',
        danger: true,
      });
      if (!ok) return;
      gs.ownedCarIds = gs.ownedCarIds.filter((c) => c !== id);
      delete gs.tuning[id];
      gs.credits += Math.round(car.priceCr * 0.6);
      ctx.save();
      ctx.go('garage');
    }),
  );
}
