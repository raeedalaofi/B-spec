// License Center: five Director Licenses, each a set of graded trials.
// Trials run on loaner cars — your garage doesn't matter here, your
// command skill does.

import { CARS } from '../../data/cars';
import { LICENSES, trialsOf, type Medal } from '../../data/licenses';
import { getTrackDef } from '../../data/tracks';
import { hasLicense, licenseAttemptable } from '../../state/trials';
import { assetUrl } from '../assets';
import { menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';

const MEDAL_ICON: Record<Medal, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

export function licensesScreen(ctx: AppContext, params?: unknown): void {
  const gs = ctx.gs!;
  const flash = (params as { flash?: { trialId: string; medal: Medal | null; detail: string } })
    ?.flash;
  const content = menuShell(ctx, 'License Center', { backTo: 'home' });

  content.innerHTML = `
    ${
      flash
        ? `<div class="${flash.medal ? 'title-banner' : 'entry-warning'} big">
            ${flash.medal ? `${MEDAL_ICON[flash.medal]} ${flash.medal.toUpperCase()} — ${flash.detail}` : `Test failed — ${flash.detail}. Try again.`}
          </div>`
        : ''
    }
    <p class="hint-note">Director Licenses gate the career's upper categories. Every test runs on a
    loaner car — only your race direction counts. Earn any medal on all four tests to take the license.</p>
    ${LICENSES.map((lic) => {
      const trials = trialsOf(lic.id);
      const held = hasLicense(gs, lic.id);
      const attemptable = licenseAttemptable(gs, lic);
      return `
        <div class="license-block ${held ? 'held' : ''} ${attemptable ? '' : 'locked'}">
          <div class="license-head">
            <div class="license-badge">
              <img src="${assetUrl(`ui/license-${lic.id}.png`)}" alt="${lic.short}" draggable="false"
                onerror="this.style.display='none'"
                onload="this.nextElementSibling.style.display='none'" />
              <span>${lic.short}</span>
            </div>
            <div>
              <b>${lic.name} ${held ? '✓' : ''}</b>
              <span class="label">${lic.tagline}</span>
            </div>
            ${attemptable ? '' : `<span class="lock-note">Requires the ${lic.requires?.toUpperCase()} license</span>`}
          </div>
          <div class="trial-list">
            ${trials
              .map((t) => {
                const medal = gs.trialMedals[t.id];
                const track = getTrackDef(t.trackId);
                return `
                <div class="trial-row">
                  <span class="trial-medal">${medal ? MEDAL_ICON[medal] : '·'}</span>
                  <div class="trial-info">
                    <b>${t.name}</b>
                    <span>${t.desc}</span>
                    <small>${CARS[t.carId].name} · ${track.name} · ${t.laps} laps</small>
                  </div>
                  <button class="btn ${medal ? '' : 'primary'}" data-trial="${t.id}" ${attemptable ? '' : 'disabled'}>
                    ${medal ? 'Retry' : 'Start'}
                  </button>
                </div>`;
              })
              .join('')}
          </div>
        </div>`;
    }).join('')}`;

  content.querySelectorAll<HTMLButtonElement>('[data-trial]').forEach((btn) =>
    btn.addEventListener('click', () => ctx.go('race', { trial: btn.dataset.trial })),
  );
}
