// Traffic model: catching, following (no-ghosting clamp), slipstream,
// overtake attempts and pass resolution. Filled in at M2 — for the
// single-car milestone this is a no-op seam called by the engine.

import type { RaceEvent, RaceState } from './types';

/**
 * Adjusts each running car's target speed for traffic and resolves battles.
 * `vTargets` is indexed like `state.cars` and is mutated in place.
 */
export function updateBattles(
  _state: RaceState,
  _vTargets: Float64Array,
  _events: RaceEvent[],
): void {
  // M2: battle state machine lives here
}
