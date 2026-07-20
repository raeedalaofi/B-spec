import { CARS } from '../../data/cars';
import { CHAMPIONSHIPS } from '../../data/championships';
import { championshipProgress } from '../../state/gameState';
import { menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';

export function homeScreen(ctx: AppContext): void {
  const gs = ctx.gs!;
  const content = menuShell(ctx, 'B-Spec Career');

  const activeCar = gs.activeCarId ? CARS[gs.activeCarId] : null;
  const titles = CHAMPIONSHIPS.filter((c) => championshipProgress(gs, c.id).champion).length;

  const cards: Array<{ id: string; title: string; sub: string; screen: string; accent?: boolean }> = [
    {
      id: 'events',
      title: 'Race Events',
      sub: 'Championships and races — earn credits and B-Spec points',
      screen: 'events',
      accent: true,
    },
    {
      id: 'dealership',
      title: 'Dealership',
      sub: 'Buy new machinery',
      screen: 'dealership',
    },
    {
      id: 'garage',
      title: 'Garage',
      sub: activeCar ? `Active: ${activeCar.name}` : 'No car yet — visit the dealership',
      screen: 'garage',
    },
    {
      id: 'driver',
      title: 'Driver',
      sub: `${gs.driver.name} — Level ${gs.driver.level}`,
      screen: 'driver',
    },
    {
      id: 'free-race',
      title: 'Free Race',
      sub: 'Exhibition — any car, any track, no stakes',
      screen: 'free-race',
    },
    {
      id: 'achievements',
      title: 'Achievements',
      sub: `${Object.keys(gs.achievements).length} unlocked`,
      screen: 'achievements',
    },
  ];

  content.innerHTML = `
    <div class="hub-status">
      <div class="hub-stat"><span class="label">Races</span><b>${gs.totals.races}</b></div>
      <div class="hub-stat"><span class="label">Wins</span><b>${gs.totals.wins}</b></div>
      <div class="hub-stat"><span class="label">Podiums</span><b>${gs.totals.podiums}</b></div>
      <div class="hub-stat"><span class="label">Titles</span><b>${titles}</b></div>
    </div>
    <div class="hub-cards">
      ${cards
        .map(
          (c) => `
        <button class="hub-card${c.accent ? ' accent' : ''}" data-screen="${c.screen}">
          <b>${c.title}</b><span>${c.sub}</span>
        </button>`,
        )
        .join('')}
    </div>
    <div class="hub-foot">
      <button class="btn" id="hub-quit">Main Menu</button>
    </div>`;

  content.querySelectorAll<HTMLButtonElement>('.hub-card').forEach((btn) => {
    btn.addEventListener('click', () => ctx.go(btn.dataset.screen as never));
  });
  content.querySelector('#hub-quit')!.addEventListener('click', () => ctx.go('main-menu'));
}
