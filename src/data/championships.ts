// Championship and event definitions. Each championship has a fixed named
// AI roster (standings persist across its events), class-gated entry, and
// prize money per race plus a title bonus.

import type { CarClass } from '../sim/types';
import type { LicenseId } from './licenses';

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
  /** Director License required to enter */
  licenseReq?: LicenseId;
  /** entries limited to this Performance Points ceiling */
  ppMax?: number;
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
        aiCarIds: ['kestrel', 'kestrel', 'kestrel', 'kestrel', 'vulpe', 'kestrel', 'kestrel'],
      },
      {
        id: 'sc-2',
        name: 'Sunrise 100',
        trackId: 'oval',
        laps: 9,
        aiCarIds: ['vulpe', 'kestrel', 'kestrel', 'kestrel', 'vulpe', 'kestrel', 'vulpe'],
      },
      {
        id: 'sc-3',
        name: 'Green Park Grand Final',
        trackId: 'greenpark',
        laps: 8,
        aiCarIds: ['taro', 'vulpe', 'vulpe', 'kestrel', 'kestrel', 'vulpe', 'vulpe'],
      },
    ],
    prize: [4000, 2800, 2000, 1500, 1100, 800, 600, 400],
    titleBonus: 8000,
    unlockAfter: null,
  },
  {
    id: 'clubman',
    name: 'Clubman Series',
    tagline: 'Turbocharged club racing. Faster cars, sharper rivals, longer races.',
    allowedClasses: ['B'],
    aiDriverIds: ['okafor', 'novak', 'reyes', 'kim', 'bauer', 'costa', 'yamada'],
    events: [
      {
        id: 'cm-1',
        name: 'Copperline Challenge',
        trackId: 'copperline',
        laps: 7,
        aiCarIds: ['falcon', 'falcon', 'falcon', 'falcon', 'serval', 'falcon', 'falcon'],
      },
      {
        id: 'cm-2',
        name: 'Sunrise 200',
        trackId: 'oval',
        laps: 14,
        aiCarIds: ['serval', 'falcon', 'falcon', 'falcon', 'falcon', 'serval', 'falcon'],
      },
      {
        id: 'cm-3',
        name: 'Green Park Clubman GP',
        trackId: 'greenpark',
        laps: 10,
        aiCarIds: ['serval', 'serval', 'falcon', 'serval', 'falcon', 'falcon', 'serval'],
      },
      {
        id: 'cm-4',
        name: 'Aria Sprint Cup',
        trackId: 'aria',
        laps: 9,
        aiCarIds: ['kite', 'serval', 'serval', 'falcon', 'serval', 'falcon', 'falcon'],
      },
    ],
    prize: [7000, 4900, 3600, 2700, 2000, 1500, 1100, 800],
    titleBonus: 15000,
    unlockAfter: 'sunday-cup',
    licenseReq: 'b',
  },
  {
    id: 'national',
    name: 'National Championship',
    tagline: 'The top flight. Flagship machinery, elite drivers, pit-window strategy.',
    allowedClasses: ['A'],
    aiDriverIds: ['vasseur', 'kowalski', 'ibarra', 'schmidt', 'fontaine', 'nakamura', 'hale'],
    events: [
      {
        id: 'nc-1',
        name: 'Aria National Trophy',
        trackId: 'aria',
        laps: 11,
        aiCarIds: ['phantom', 'phantom', 'phantom', 'phantom', 'phantom', 'phantom', 'phantom'],
      },
      {
        id: 'nc-2',
        name: 'Copperline Masters',
        trackId: 'copperline',
        laps: 11,
        aiCarIds: ['phantom', 'phantom', 'phantom', 'phantom', 'phantom', 'phantom', 'phantom'],
      },
      {
        id: 'nc-3',
        name: 'Green Park Invitational',
        trackId: 'greenpark',
        laps: 13,
        aiCarIds: ['arrow', 'phantom', 'arrow', 'phantom', 'arrow', 'phantom', 'phantom'],
      },
      {
        id: 'nc-4',
        name: 'Sunrise 350',
        trackId: 'oval',
        laps: 20,
        aiCarIds: ['arrow', 'phantom', 'arrow', 'arrow', 'phantom', 'phantom', 'phantom'],
      },
      {
        id: 'nc-5',
        name: 'Aria Grand Final',
        trackId: 'aria',
        laps: 16,
        aiCarIds: ['arrow', 'arrow', 'phantom', 'arrow', 'arrow', 'phantom', 'arrow'],
      },
    ],
    prize: [16000, 11000, 8000, 6000, 4500, 3400, 2500, 1800],
    titleBonus: 45000,
    unlockAfter: 'clubman',
    licenseReq: 'ia',
  },
];

export const CHAMPIONSHIP_BY_ID: Record<string, ChampionshipDef> = Object.fromEntries(
  CHAMPIONSHIPS.map((c) => [c.id, c]),
);
