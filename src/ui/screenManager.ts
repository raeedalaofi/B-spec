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

export function goTo(ctx: AppContext, id: ScreenId, params?: unknown): void {
  const fn = registry.get(id);
  if (!fn) throw new Error(`unknown screen '${id}'`);
  cleanup?.();
  cleanup = null;
  ctx.root.innerHTML = '';
  ctx.root.scrollTop = 0;
  const result = fn(ctx, params);
  if (typeof result === 'function') cleanup = result;
}
