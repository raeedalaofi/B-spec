// localStorage persistence with schema migrations. A corrupt save never
// crashes the game — load() returns null and the UI offers a fresh start.

import { SCHEMA_VERSION, type GameState } from './gameState';
import { migrate } from './migrations';

export const SAVE_KEY = 'bspec-save';

export function saveGame(gs: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gs));
  } catch {
    // storage full/blocked — the game keeps running, just unsaved
  }
}

export function loadGame(): GameState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const gs = migrate(parsed, SCHEMA_VERSION);
    if (!gs.driver || !Array.isArray(gs.ownedCarIds)) return null;
    return gs;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
