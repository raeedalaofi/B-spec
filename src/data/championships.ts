// Championship and event definitions. Each championship has a fixed named
// AI roster (standings persist across its events), class-gated entry, and
// prize money per race plus a title bonus.

import type { CarClass } from '../sim/types';

export interface EventDef {
  id: string;
  name: string;
  trackId: string;
  laps: number;
  /** car ids for the 7 AI entries, in grid order */
  aiCarIds: string[];
}

export interface ChampionshipDef {
  id: string;
  name: string;
  tagline: string;
  /** classes the player's car may be */
  allowedClasses: CarClass[];
  /** ids into AI_DRIVERS (7 per championship) */
  aiDriverIds: string[];
  events: EventDef[];
  /** credits per finishing position (8 entries) */
  prize: number[];
  titleBonus: number;
  /** championship that must be completed first */
  unlockAfter: string | null;
}

/** championship points per finishing position */
export const CHAMP_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

export const CHAMPIONSHIPS: ChampionshipDef[] = [
  {
    id: 'sunday-cup',
    name: 'Sunday Cup',
    tagline: 'Where every legend starts. Compact hatches, club circuits.',
    allowedClasses: ['C'],
    aiDriverIds: ['miller', 'sato', 'weber', 'rossi', 'tanaka', 'lindqvist', 'dubois'],
    events: [
      {
        id: 'sc-1',
        name: 'Green Park Sprint',
        trackId: 'greenpark',
        laps: 5,
        aiCarIds: ['kestrel', 'kestrel', 'vulpe', 'kestrel', 'vulpe', 'kestrel', 'taro'],
      },
      {
        id: 'sc-2',
        name: 'Sunrise 100',
        trackId: 'oval',
        laps: 9,
        aiCarIds: ['vulpe', 'kestrel', 'taro', 'kestrel', 'vulpe', 'kestrel', 'vulpe'],
      },
      {
        id: 'sc-3',
        name: 'Green Park Grand Final',
        trackId: 'greenpark',
        laps: 8,
        aiCarIds: ['taro', 'vulpe', 'vulpe', 'taro', 'kestrel', 'vulpe', 'taro'],
      },
    ],
    prize: [3000, 2000, 1400, 1000, 700, 500, 350, 200],
    titleBonus: 5000,
    unlockAfter: null,
  },
];

export const CHAMPIONSHIP_BY_ID: Record<string, ChampionshipDef> = Object.fromEntries(
  CHAMPIONSHIPS.map((c) => [c.id, c]),
);
