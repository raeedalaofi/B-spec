// Entry point: boot the career.

import './ui/fonts.css';
import './ui/tokens.css';
import './ui/styles.css';
import { loadGame, saveGame } from './state/save';
import type { GameState } from './state/gameState';
import { goTo, type AppContext, type ScreenId } from './ui/screenManager';
import { registerAllScreens } from './ui/screens';
import { SOUND } from './ui/sound';

registerAllScreens();

// soft UI click for every button press (respects the audio setting)
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) SOUND.click();
});

const root = document.querySelector<HTMLDivElement>('#app')!;

const ctx: AppContext = {
  root,
  gs: null as GameState | null,
  save() {
    if (ctx.gs) saveGame(ctx.gs);
  },
  go(id: ScreenId, params?: unknown) {
    // guard: everything except the main menu needs a loaded game
    if (id !== 'main-menu' && !ctx.gs) id = 'main-menu';
    goTo(ctx, id, params);
  },
};

// resume directly into the career if a save exists
ctx.gs = loadGame();
SOUND.setEnabled(ctx.gs?.settings.audio ?? true);
ctx.go(ctx.gs ? 'home' : 'main-menu');
