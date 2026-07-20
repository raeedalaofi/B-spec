import { CARS } from '../../data/cars';
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
      const active = gs.activeCarId === id;
      const sellPrice = Math.round(car.priceCr * 0.6);
      const kmh = Math.round(car.topSpeedMs * 3.6);
      return `
        <div class="car-card ${active ? 'active-car' : ''}">
          <div class="car-chip" style="background:${car.color}"></div>
          <div class="car-info">
            <b>${car.name} ${active ? '<span class="active-tag">ACTIVE</span>' : ''}</b>
            <span class="label">Class ${car.class}</span>
            <span class="car-specs">${car.powerKw} kW · ${car.massKg} kg · ${kmh} km/h · grip ${car.grip.toFixed(2)}</span>
          </div>
          <div class="car-buy">
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
  content.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.sell!;
      const car = CARS[id];
      if (!confirm(`Sell the ${car.name} for ${fmtCr(Math.round(car.priceCr * 0.6))}?`)) return;
      gs.ownedCarIds = gs.ownedCarIds.filter((c) => c !== id);
      gs.credits += Math.round(car.priceCr * 0.6);
      ctx.save();
      ctx.go('garage');
    }),
  );
}
