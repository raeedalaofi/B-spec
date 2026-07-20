// Entry point: boot the career.

import './ui/styles.css';
import { loadGame, saveGame } from './state/save';
import type { GameState } from './state/gameState';
import { goTo, type AppContext, type ScreenId } from './ui/screenManager';
import { registerAllScreens } from './ui/screens';

registerAllScreens();

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
ctx.go(ctx.gs ? 'home' : 'main-menu');
