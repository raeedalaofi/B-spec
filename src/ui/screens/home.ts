import { CARS } from '../../data/cars';
import { CHAMPIONSHIPS } from '../../data/championships';
import { championshipProgress } from '../../state/gameState';
import { clearRaceInProgress, loadRaceInProgress, restoreRace } from '../../state/raceSave';
import { highestLicense } from '../../state/trials';
import { imgTag } from '../assets';
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
      id: 'licenses',
      title: 'License Center',
      sub: highestLicense(gs)
        ? `Held: ${highestLicense(gs)!.name}`
        : 'Earn Director Licenses to unlock the upper categories',
      screen: 'licenses',
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

  // A race left running is the most urgent thing on this screen: offer it
  // first, and let the player abandon it if they would rather not.
  const snap = loadRaceInProgress();
  const resumeHtml = snap
    ? `<div class="resume-banner">
         <div>
           <span class="label">Race in progress</span>
           <b>${snap.title}</b>
           <span class="resume-sub">${snap.subtitle}</span>
         </div>
         <div class="resume-actions">
           <button class="btn primary" id="hub-resume">Resume Race</button>
           <button class="btn ghost" id="hub-abandon">Abandon</button>
         </div>
       </div>`
    : '';

  content.innerHTML = `
    ${resumeHtml}
    <div class="hub-status">
      <div class="hub-stat"><span class="label">Races</span><b>${gs.totals.races}</b></div>
      <div class="hub-stat"><span class="label">Wins</span><b>${gs.totals.wins}</b></div>
      <div class="hub-stat"><span class="label">Podiums</span><b>${gs.totals.podiums}</b></div>
      <div class="hub-stat"><span class="label">Titles</span><b>${titles}</b></div>
    </div>
    <div class="hub-cards">
      ${cards
        .map((c) => {
          const icon: Record<string, string> = {
            events: 'ui/icon-events.png',
            dealership: 'ui/icon-dealership.png',
            garage: 'ui/icon-garage.png',
            driver: 'ui/icon-driver.png',
            licenses: 'ui/license-b.png',
            'free-race': 'ui/icon-freerace.png',
            achievements: 'ui/icon-trophy.png',
          };
          return `
        <button class="hub-card${c.accent ? ' accent' : ''}" data-screen="${c.screen}">
          ${icon[c.id] ? imgTag(icon[c.id], 'hub-icon') : ''}
          <b>${c.title}</b><span>${c.sub}</span>
        </button>`;
        })
        .join('')}
    </div>
    <div class="hub-foot">
      <button class="btn" id="hub-quit">Main Menu</button>
    </div>`;

  if (snap) {
    content.querySelector('#hub-resume')!.addEventListener('click', () => {
      const state = restoreRace(snap);
      if (!state) {
        clearRaceInProgress();
        ctx.go('home');
        return;
      }
      ctx.go('race', { ...(snap.params as object), __resume: state });
    });
    content.querySelector('#hub-abandon')!.addEventListener('click', () => {
      clearRaceInProgress();
      ctx.go('home');
    });
  }

  content.querySelectorAll<HTMLButtonElement>('.hub-card').forEach((btn) => {
    btn.addEventListener('click', () => ctx.go(btn.dataset.screen as never));
  });
  content.querySelector('#hub-quit')!.addEventListener('click', () => ctx.go('main-menu'));
}
