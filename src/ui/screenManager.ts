// Tiny screen manager: one active screen at a time, rebuilt from GameState
// on entry. Screens register themselves in screens/index.ts.

import type { GameState } from '../state/gameState';

export type ScreenId =
  | 'main-menu'
  | 'home'
  | 'dealership'
  | 'garage'
  | 'tuning'
  | 'driver'
  | 'events'
  | 'race'
  | 'results'
  | 'achievements'
  | 'free-race'
  | 'licenses'
  | 'catalog';

export interface AppContext {
  root: HTMLElement;
  gs: GameState | null;
  /** persist the current GameState */
  save(): void;
  go(id: ScreenId, params?: unknown): void;
}

export type ScreenFn = (ctx: AppContext, params?: unknown) => void | (() => void);

const registry = new Map<ScreenId, ScreenFn>();
let cleanup: (() => void) | null = null;

export function registerScreen(id: ScreenId, fn: ScreenFn): void {
  registry.set(id, fn);
}

/**
 * Every navigation used to be a hard cut — innerHTML cleared, new screen
 * painted, no beat in between. A short fade is the cheapest thing that makes
 * an interface feel considered rather than assembled, and it costs one class.
 *
 * The screen is built synchronously either way; only the opacity is animated,
 * so nothing here can delay input or leave a half-built screen on display.
 * Reduced-motion users get the old instant swap, via the CSS.
 */
export function goTo(ctx: AppContext, id: ScreenId, params?: unknown): void {
  const fn = registry.get(id);
  if (!fn) throw new Error(`unknown screen '${id}'`);
  cleanup?.();
  cleanup = null;
  ctx.root.innerHTML = '';
  ctx.root.scrollTop = 0;
  const result = fn(ctx, params);
  if (typeof result === 'function') cleanup = result;

  ctx.root.classList.remove('screen-enter');
  // force a reflow so the class removal takes effect before it is re-added,
  // otherwise repeat navigations to the same screen never re-trigger
  void ctx.root.offsetWidth;
  ctx.root.classList.add('screen-enter');
}
