import { createNewGame } from '../../state/gameState';
import { deleteSave, hasSave, loadGame } from '../../state/save';
import type { AppContext } from '../screenManager';

export function mainMenuScreen(ctx: AppContext): void {
  const wrap = document.createElement('div');
  wrap.className = 'main-menu';
  const canContinue = hasSave();
  wrap.innerHTML = `
    <div class="menu-logo">
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
    <div class="menu-footnote">A browser revival of the Gran Turismo 4 B-Spec spirit — manage your AI driver through a racing career.</div>`;
  ctx.root.appendChild(wrap);

  wrap.querySelector('#mm-continue')?.addEventListener('click', () => {
    const gs = loadGame();
    if (!gs) {
      alert('Save data could not be read. Starting fresh.');
      deleteSave();
      ctx.go('main-menu');
      return;
    }
    ctx.gs = gs;
    ctx.go('home');
  });

  wrap.querySelector('#mm-new')!.addEventListener('click', () => {
    if (canContinue && !confirm('Start a new career? Your existing save will be overwritten.')) {
      return;
    }
    const name = (wrap.querySelector('#mm-name') as HTMLInputElement).value.trim() || 'A. Driver';
    ctx.gs = createNewGame(name);
    ctx.save();
    ctx.go('home');
  });
}
