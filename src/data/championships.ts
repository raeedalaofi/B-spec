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
  /** grouping in the events browser */
  category?: 'core' | 'onemake' | 'grandtour';
  /** one-make cups: the player must race this exact car */
  requiredCarId?: string;
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
        aiCarIds: ['vulpe', 'kestrel', 'vulpe', 'kestrel', 'kestrel', 'kestrel', 'vulpe'],
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
    category: 'core',
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
    category: 'core',
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
    category: 'core',
  },
];

export const CHAMPIONSHIP_BY_ID: Record<string, ChampionshipDef> = Object.fromEntries(
  CHAMPIONSHIPS.map((c) => [c.id, c]),
);

// ---------------------------------------------------------------------------
// Generated championships: One-Make Cups (every car gets its own spec
// series) and the Grand Tour (multi-race series across the expanded
// track roster with PP ceilings).

import { AI_DRIVERS } from './aidrivers';
import { CAR_LIST } from './cars';

const GEN_ROOKIES = AI_DRIVERS.slice(0, 7).map((d) => d.id);
const GEN_PROS = AI_DRIVERS.slice(7, 14).map((d) => d.id);
const GEN_ACES = AI_DRIVERS.slice(14, 21).map((d) => d.id);

const ONEMAKE_TRACKS = [
  'tsubame', 'greenpark', 'sonora', 'copperline', 'lumiere', 'motegrand',
  'condorpass', 'hanriver', 'fujimi', 'newport', 'kowloon', 'shirakawa',
];

function rotateIds(arr: string[], by: number): string[] {
  return arr.map((_, i) => arr[(i + by) % arr.length]);
}

function onemakeCups(): ChampionshipDef[] {
  return CAR_LIST.map((car, idx) => {
    const roster = car.class === 'C' ? GEN_ROOKIES : car.class === 'B' ? GEN_PROS : GEN_ACES;
    const prize1 = car.class === 'C' ? 3500 : car.class === 'B' ? 6500 : 13000;
    const licenseReq = car.class === 'C' ? undefined : car.class === 'B' ? 'b' : 'a';
    return {
      id: `cup-${car.id}`,
      name: `${car.name} Cup`,
      tagline: `One-make racing: everyone in identical ${car.name}s. Pure direction.`,
      allowedClasses: [car.class],
      aiDriverIds: rotateIds(roster, idx),
      events: [0, 1, 2].map((n) => ({
        id: `cup-${car.id}-${n + 1}`,
        name: `${car.name} Cup — Round ${n + 1}`,
        trackId: ONEMAKE_TRACKS[(idx * 3 + n) % ONEMAKE_TRACKS.length],
        laps: 5 + n * 2,
        aiCarIds: Array(7).fill(car.id),
      })),
      prize: [prize1, prize1 * 0.7, prize1 * 0.5, prize1 * 0.38, prize1 * 0.28, prize1 * 0.2, prize1 * 0.15, prize1 * 0.1].map(
        (v) => Math.round(v / 100) * 100,
      ),
      titleBonus: prize1 * 2,
      unlockAfter: null,
      licenseReq,
      category: 'onemake' as const,
      requiredCarId: car.id,
    };
  });
}

const GRAND_TOUR_SPECS: Array<{
  id: string;
  name: string;
  tagline: string;
  cls: 'B' | 'A';
  tracks: string[];
  ppMax: number;
}> = [
  {
    id: 'gt-pacific',
    name: 'Pacific Tour',
    tagline: 'Four rounds across the eastern circuits.',
    cls: 'B',
    tracks: ['tsubame', 'shirakawa', 'motegrand', 'fujimi'],
    ppMax: 650,
  },
  {
    id: 'gt-city',
    name: 'City Lights Tour',
    tagline: 'Street racing at its finest: four city rounds.',
    cls: 'B',
    tracks: ['newport', 'lumiere', 'kowloon', 'hanriver'],
    ppMax: 650,
  },
  {
    id: 'gt-continental',
    name: 'Continental Tour',
    tagline: 'The classic road courses, four rounds.',
    cls: 'B',
    tracks: ['greenpark', 'sonora', 'condorpass', 'copperline'],
    ppMax: 650,
  },
  {
    id: 'gt-speed',
    name: 'Speed Kings Tour',
    tagline: 'Top-speed circuits only — slipstream warfare.',
    cls: 'A',
    tracks: ['neonspeedway', 'oval', 'fujimi', 'lacourbe'],
    ppMax: 730,
  },
  {
    id: 'gt-mountain',
    name: 'Mountain Masters Tour',
    tagline: 'Gradients, gravity and guts.',
    cls: 'A',
    tracks: ['condorpass', 'alpenstrasse', 'shirakawa', 'kaiserwald'],
    ppMax: 730,
  },
  {
    id: 'gt-world',
    name: 'World Tour Finale',
    tagline: 'The complete test across four continents of racing.',
    cls: 'A',
    tracks: ['hanriver', 'lacourbe', 'aria', 'kaiserwald'],
    ppMax: 730,
  },
];

function grandTours(): ChampionshipDef[] {
  return GRAND_TOUR_SPECS.map((spec, idx) => {
    const roster = spec.cls === 'B' ? GEN_PROS : GEN_ACES;
    const cars =
      spec.cls === 'B'
        ? ['falcon', 'serval', 'falcon', 'kite', 'serval', 'falcon', 'serval']
        : ['phantom', 'phantom', 'arrow', 'phantom', 'phantom', 'arrow', 'phantom'];
    const prize1 = spec.cls === 'B' ? 8500 : 18000;
    return {
      id: spec.id,
      name: spec.name,
      tagline: spec.tagline,
      allowedClasses: [spec.cls],
      aiDriverIds: rotateIds(roster, idx),
      events: spec.tracks.map((trackId, n) => ({
        id: `${spec.id}-${n + 1}`,
        name: `${spec.name} — Round ${n + 1}`,
        trackId,
        laps: trackId === 'kaiserwald' ? 4 : trackId === 'lacourbe' ? 6 : 8,
        aiCarIds: rotateIds(cars, n),
      })),
      prize: [prize1, prize1 * 0.7, prize1 * 0.52, prize1 * 0.4, prize1 * 0.3, prize1 * 0.22, prize1 * 0.16, prize1 * 0.12].map(
        (v) => Math.round(v / 100) * 100,
      ),
      titleBonus: prize1 * 3,
      unlockAfter: null,
      licenseReq: spec.cls === 'B' ? ('a' as const) : ('ia' as const),
      ppMax: spec.ppMax,
      category: 'grandtour' as const,
    };
  });
}

export const GENERATED_CHAMPIONSHIPS: ChampionshipDef[] = [...onemakeCups(), ...grandTours()];
CHAMPIONSHIPS.push(...GENERATED_CHAMPIONSHIPS);
for (const champ of GENERATED_CHAMPIONSHIPS) {
  CHAMPIONSHIP_BY_ID[champ.id] = champ;
}
