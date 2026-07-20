import { TRACK_DEFS } from '../../data/tracks';
import { pointsToNextLevel } from '../../state/progression';
import { imgTag } from '../assets';
import { fmtLapTime, menuShell, statBars } from '../menuCommon';
import type { AppContext } from '../screenManager';

const AVATAR_COUNT = 6;

export function driverScreen(ctx: AppContext): void {
  const gs = ctx.gs!;
  const content = menuShell(ctx, 'Driver', { backTo: 'home' });
  const need = pointsToNextLevel(gs.driver.level);
  const pct = Math.min(100, Math.round((gs.driver.bspecPoints / need) * 100));
  const avatar = gs.settings.avatar ?? 1;
  content.innerHTML = `
    <div class="driver-card">
      <div class="driver-head">
        <div class="driver-avatar">
          ${imgTag(`portraits/player-${avatar}.png`, 'avatar-face', gs.driver.name)}
          <button class="btn avatar-cycle" id="avatar-cycle" title="Change portrait">↻</button>
        </div>
        <div>
          <h2>${gs.driver.name}</h2>
          <span class="label">B-Spec Driver — Level ${gs.driver.level}</span>
        </div>
        <div class="driver-level-ring"><b>${gs.driver.level}</b></div>
      </div>
      <div class="cond-row"><span class="label">Next level</span>
        <span class="val">${gs.driver.bspecPoints} / ${need} pts</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <h3 class="section-title">Abilities</h3>
      ${statBars(gs.driver.stats as unknown as Record<string, number>)}
      <h3 class="section-title">Career Record</h3>
      <div class="hub-status">
        <div class="hub-stat"><span class="label">Races</span><b>${gs.totals.races}</b></div>
        <div class="hub-stat"><span class="label">Wins</span><b>${gs.totals.wins}</b></div>
        <div class="hub-stat"><span class="label">Podiums</span><b>${gs.totals.podiums}</b></div>
        <div class="hub-stat"><span class="label">Overtakes</span><b>${gs.totals.overtakes}</b></div>
      </div>
      <p class="hint-note">Your driver develops on their own with every race — position, clean
      overtakes and fastest laps all earn B-Spec points. Higher pace commands build skill
      under pressure but risk mistakes.</p>
    </div>
    ${
      gs.history.length > 0
        ? `<h3 class="section-title">Recent Races</h3>
          <table class="results-table history-table">
            <thead><tr><th>Series</th><th>Event</th><th>Track</th><th>P</th><th>Best Lap</th><th>Cr.</th><th>Pts</th></tr></thead>
            <tbody>
              ${gs.history
                .map(
                  (h) => `<tr>
                    <td>${h.series}</td><td>${h.event}</td>
                    <td>${TRACK_DEFS[h.trackId]?.name ?? '-'}</td>
                    <td class="mono ${h.position === 1 ? 'win' : ''}">${h.position}</td>
                    <td class="mono">${fmtLapTime(h.bestLapS)}</td>
                    <td class="mono">${h.creditsEarned.toLocaleString('en-US')}</td>
                    <td class="mono">+${h.pointsEarned}</td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>`
        : ''
    }`;

  content.querySelector('#avatar-cycle')?.addEventListener('click', () => {
    gs.settings.avatar = (avatar % AVATAR_COUNT) + 1;
    ctx.save();
    ctx.go('driver');
  });
}
