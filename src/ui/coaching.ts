// Onboarding: teach one lever at a time, in the race, when it matters.
//
// A B-Spec game has an unusual problem — the player is not driving, so
// nothing about the controls is discoverable by trying them. The old game
// dropped a first-timer into a race with six buttons, no explanation, and a
// grid slot at the back. This teaches the same six things, one at a time, at
// the moment each one first becomes relevant, and then never mentions them
// again.
//
// Tips are keyed and stored in the save, so a returning player is not
// re-taught things they already know.

import type { CarRaceState, RaceState } from '../sim/types';

export interface CoachTip {
  id: string;
  title: string;
  text: string;
  /** where to point on screen */
  anchor: 'orders' | 'pit' | 'condition' | 'intel' | 'tower' | 'radio';
}

const TIPS: Array<CoachTip & { when(state: RaceState, player: CarRaceState): boolean }> = [
  {
    id: 'orders',
    title: 'You give the orders',
    text: 'You are on the pit wall, not in the car. Everything you do is an instruction — and every instruction costs something. Push burns tires. Saving them costs you time.',
    anchor: 'orders',
    when: (state) => state.phase === 'racing' && state.raceTime > 3,
  },
  {
    id: 'intel',
    title: 'Know who you are racing',
    text: 'Every driver has a reputation. A wall will not give you the place; a lunger will hand it to you if you keep your line and wait for the mistake.',
    anchor: 'intel',
    when: (_state, player) => player.battle !== null || player.underAttack,
  },
  {
    id: 'attack',
    title: 'Attacking is a trade',
    text: 'Attack makes your driver commit to moves they would otherwise wave off. It also finishes the tires. Use it when a place is worth the rubber.',
    anchor: 'orders',
    when: (_state, player) => player.battle?.phase === 'FOLLOWING',
  },
  {
    id: 'tires',
    title: 'Watch the rubber',
    text: 'The panel tells you how many laps are left in this set and how many are left in the race. When the first number drops below the second, you have a decision to make.',
    anchor: 'condition',
    when: (_state, player) => player.tireWear > 0.5,
  },
  {
    id: 'radio',
    title: 'Answer the radio',
    text: 'Your driver will ask for a call and give you a few seconds to make it. Say nothing and they will decide for themselves — sometimes that is fine, sometimes it is not.',
    anchor: 'radio',
    when: (state) => state.raceTime > 20,
  },
  {
    id: 'pit',
    title: 'The stop is a plan',
    text: 'Boxing is not just fresh tires. Which compound, and how much fuel: a splash is quicker in the box but might not reach the flag.',
    anchor: 'pit',
    when: (_state, player) => player.tireWear > 0.7 || player.fuelL < player.spec.fuelTankL * 0.35,
  },
];

/**
 * The next tip worth showing, or null. One at a time, and only ever the
 * first one that has become relevant — a stack of tips is a wall of text.
 */
export function nextTip(
  state: RaceState,
  player: CarRaceState,
  seen: Record<string, number>,
): CoachTip | null {
  for (const tip of TIPS) {
    if (seen[tip.id]) continue;
    if (tip.when(state, player)) {
      const { id, title, text, anchor } = tip;
      return { id, title, text, anchor };
    }
  }
  return null;
}

export const COACH_TIP_IDS = TIPS.map((t) => t.id);
