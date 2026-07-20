import { pointsToNextLevel } from '../../state/progression';
import { menuShell, statBars } from '../menuCommon';
import type { AppContext } from '../screenManager';

export function driverScreen(ctx: AppContext): void {
  const gs = ctx.gs!;
  const content = menuShell(ctx, 'Driver', { backTo: 'home' });
  const need = pointsToNextLevel(gs.driver.level);
  const pct = Math.min(100, Math.round((gs.driver.bspecPoints / need) * 100));
  content.innerHTML = `
    <div class="driver-card">
      <div class="driver-head">
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
    </div>`;
}
