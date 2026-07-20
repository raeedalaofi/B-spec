import { ACHIEVEMENTS } from '../../state/achievements';
import { assetUrl } from '../assets';
import { menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';

export function achievementsScreen(ctx: AppContext): void {
  const gs = ctx.gs!;
  const content = menuShell(ctx, 'Achievements', { backTo: 'home' });
  const unlocked = Object.keys(gs.achievements).length;
  content.innerHTML = `
    <div class="cond-row" style="max-width:420px">
      <span class="label">Progress</span>
      <span class="val">${unlocked} / ${ACHIEVEMENTS.length}</span>
    </div>
    <div class="bar" style="max-width:420px"><i style="width:${Math.round((unlocked / ACHIEVEMENTS.length) * 100)}%"></i></div>
    <div class="ach-grid">
      ${ACHIEVEMENTS.map((def) => {
        const at = gs.achievements[def.id];
        return `
          <div class="ach-card ${at ? 'unlocked' : ''}">
            <span class="ach-icon">
              <img src="${assetUrl(`ui/icon-ach-${def.id}.png`)}" alt="" draggable="false"
                onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" />
              <span style="display:none">${at ? '🏆' : '🔒'}</span>
            </span>
            <div>
              <b>${def.name}</b>
              <span>${def.desc}</span>
              ${at ? `<small>${new Date(at).toLocaleDateString('en-GB')}</small>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}
