import { createNewGame } from '../../state/gameState';
import { deleteSave, hasSave, loadGame } from '../../state/save';
import { assetUrl } from '../assets';
import { alertDialog, confirmDialog } from '../dialog';
import type { AppContext } from '../screenManager';

export function mainMenuScreen(ctx: AppContext): void {
  const wrap = document.createElement('div');
  wrap.className = 'main-menu';
  const canContinue = hasSave();
  wrap.innerHTML = `
    <img src="${assetUrl('cinematic/intro-pitwall.png')}" class="menu-backdrop" alt="" draggable="false"
      onerror="this.style.display='none'" />
    <div class="menu-logo">
      <img src="${assetUrl('ui/logo-main.png')}" class="logo-img" alt="B-SPEC" draggable="false"
        onerror="this.style.display='none'"
        onload="this.parentElement.querySelector('.logo-b').style.display='none'" />
      <div class="logo-b">B-SPEC</div>
      <div class="logo-sub">Race Director Simulation</div>
      <div class="logo-tag">You don't drive. You decide.</div>
    </div>
    <div class="menu-actions">
      ${canContinue ? '<button class="btn primary big" id="mm-continue">Continue Career</button>' : ''}
      <div class="new-game-row">
        <input id="mm-name" class="text-input" maxlength="18" placeholder="Driver name" value="A. Driver" />
        <button class="btn ${canContinue ? '' : 'primary'} big" id="mm-new">New Career</button>
      </div>
    </div>
    <div class="menu-footnote">You are the race director, not the driver. Read the race, call the strategy, take your driver through a career.</div>`;
  ctx.root.appendChild(wrap);

  wrap.querySelector('#mm-continue')?.addEventListener('click', async () => {
    const gs = loadGame();
    if (!gs) {
      await alertDialog('Save data could not be read', 'Starting a fresh career.');
      deleteSave();
      ctx.go('main-menu');
      return;
    }
    ctx.gs = gs;
    ctx.go('home');
  });

  wrap.querySelector('#mm-new')!.addEventListener('click', async () => {
    if (
      canContinue &&
      !(await confirmDialog({
        title: 'Start a new career?',
        body: 'Your existing save will be overwritten. This cannot be undone.',
        confirmLabel: 'Overwrite',
        danger: true,
      }))
    ) {
      return;
    }
    const name = (wrap.querySelector('#mm-name') as HTMLInputElement).value.trim() || 'A. Driver';
    ctx.gs = createNewGame(name);
    ctx.save();
    ctx.go('home');
  });
}
