// Catalog browser: lists a standalone-event category (trophies, reverse GP,
// endurance, rally, super league) or the driving missions, with entry
// gating by car class, Director License and Performance Points.

import { CARS } from '../../data/cars';
import { CATALOG, CATEGORY_INFO, type CatalogCategory, type StandaloneEventDef } from '../../data/eventCatalog';
import type { Medal } from '../../data/licenses';
import { MISSIONS } from '../../data/missions';
import { tunedSpec } from '../../data/parts';
import { getTrackDef } from '../../data/tracks';
import { ppOf } from '../../state/pp';
import { hasLicense } from '../../state/trials';
import { fmtCr, menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';

const MEDAL_ICON: Record<Medal, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

interface CatalogParams {
  category: CatalogCategory | 'missions';
  flash?: { trialId: string; medal: Medal | null; detail: string };
}

function entryProblem(ctx: AppContext, event: StandaloneEventDef): string | null {
  const gs = ctx.gs!;
  const car = gs.activeCarId ? CARS[gs.activeCarId] : null;
  if (!car) return 'You need a car';
  if (!event.allowedClasses.includes(car.class)) {
    return `Class ${event.allowedClasses.join('/')} only`;
  }
  if (event.licenseReq && !hasLicense(gs, event.licenseReq)) {
    return `${event.licenseReq.toUpperCase()} license required`;
  }
  if (event.ppMax) {
    const pp = ppOf(tunedSpec(car, gs.tuning[gs.activeCarId] ?? []));
    if (pp > event.ppMax) return `PP limit ${event.ppMax} (yours: ${pp})`;
  }
  return null;
}

function missionsView(ctx: AppContext, content: HTMLElement, params: CatalogParams): void {
  const gs = ctx.gs!;
  content.innerHTML = `
    ${
      params.flash
        ? `<div class="${params.flash.medal ? 'title-banner' : 'entry-warning'} big">
            ${params.flash.medal ? `${MEDAL_ICON[params.flash.medal]} ${params.flash.medal.toUpperCase()} — ${params.flash.detail}` : `Mission failed — ${params.flash.detail}`}
          </div>`
        : ''
    }
    <p class="hint-note">Skill trials on loaner cars — slipstream duels, charges, time attacks and
    tire craft. Medals pay credits; upgrades pay the difference.</p>
    <div class="trial-list">
      ${MISSIONS.map((m) => {
        const medal = gs.trialMedals[m.id];
        return `
          <div class="trial-row">
            <span class="trial-medal">${medal ? MEDAL_ICON[medal] : '·'}</span>
            <div class="trial-info">
              <b>${m.name}</b>
              <span>${m.desc}</span>
              <small>${CARS[m.carId].name} · ${getTrackDef(m.trackId).name} · ${m.laps} laps · gold ${fmtCr(m.rewardCr[0])}</small>
            </div>
            <button class="btn ${medal ? '' : 'primary'}" data-trial="${m.id}">${medal ? 'Retry' : 'Start'}</button>
          </div>`;
      }).join('')}
    </div>`;
  content.querySelectorAll<HTMLButtonElement>('[data-trial]').forEach((btn) =>
    btn.addEventListener('click', () => ctx.go('race', { trial: btn.dataset.trial })),
  );
}

export function catalogScreen(ctx: AppContext, params?: unknown): void {
  const gs = ctx.gs!;
  const p = params as CatalogParams;
  const isMissions = p.category === 'missions';
  const info = isMissions
    ? { title: 'Driving Missions', sub: '' }
    : CATEGORY_INFO.find((c) => c.id === p.category)!;
  const content = menuShell(ctx, info.title, { backTo: 'events' });

  if (isMissions) {
    missionsView(ctx, content, p);
    return;
  }

  const events = CATALOG[p.category as CatalogCategory];
  const done = events.filter((e) => gs.standaloneResults[e.id]).length;
  content.innerHTML = `
    <p class="hint-note">${info.sub} — ${done}/${events.length} raced.</p>
    <div class="event-list">
      ${events
        .map((event) => {
          const track = getTrackDef(event.trackId);
          const best = gs.standaloneResults[event.id];
          const problem = entryProblem(ctx, event);
          return `
          <div class="event-card">
            <div class="event-info">
              <b>${event.name} ${best?.position === 1 ? '🏆' : ''}</b>
              <span class="label">${track.name} · ${event.laps} laps · Class ${event.allowedClasses.join('/')}${event.licenseReq ? ` · ${event.licenseReq.toUpperCase()}` : ''}${event.ppMax ? ` · ≤${event.ppMax} PP` : ''}</span>
              ${best ? `<span class="event-best">Best: P${best.position}</span>` : ''}
              ${problem ? `<span class="event-block">${problem}</span>` : ''}
            </div>
            <div class="event-enter">
              <span class="car-price">1st: ${fmtCr(event.prize[0])}</span>
              <button class="btn primary" data-event="${event.id}" ${problem ? 'disabled' : ''}>
                ${best ? 'Race Again' : 'Enter Race'}
              </button>
            </div>
          </div>`;
        })
        .join('')}
    </div>`;

  content.querySelectorAll<HTMLButtonElement>('[data-event]').forEach((btn) =>
    btn.addEventListener('click', () => ctx.go('race', { standalone: btn.dataset.event })),
  );
}
