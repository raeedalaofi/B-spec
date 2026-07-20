// The Director License system — the B-Spec adaptation of GT-style license
// schools. You never steer here either: every test examines race-direction
// skills (traffic management, pace discipline, tire strategy, duels) with
// gold/silver/bronze grading. Licenses gate the career's upper categories.

export type LicenseId = 'b' | 'a' | 'ic' | 'ia' | 's';
export type Medal = 'gold' | 'silver' | 'bronze';

export type TrialObjective =
  /** finishing position thresholds (1 = win) */
  | { type: 'position'; gold: number; silver: number; bronze: number }
  /** total race time vs the car's ideal race time (multiplier + overhead) */
  | { type: 'time'; goldMult: number; silverMult: number; bronzeMult: number }
  /** 1v1: gold = win; silver/bronze by final gap when beaten */
  | { type: 'duel'; silverGapS: number; bronzeGapS: number }
  /** gold = win + fastest lap + zero mistakes; silver = win; bronze = podium */
  | { type: 'perfect' };

export interface TrialDef {
  id: string;
  /** null = standalone driving mission */
  licenseId: LicenseId | null;
  name: string;
  desc: string;
  carId: string;
  trackId: string;
  laps: number;
  seed: number;
  /** opposition; empty = solo time attack */
  ai: Array<{ driverId: string; carId: string }>;
  trackMods?: { gripMult?: number; wearMult?: number };
  objective: TrialObjective;
  /** first-time reward per medal [gold, silver, bronze] */
  rewardCr: [number, number, number];
}

export interface LicenseDef {
  id: LicenseId;
  name: string;
  short: string;
  tagline: string;
  /** license that must be held first */
  requires: LicenseId | null;
}

export const LICENSES: LicenseDef[] = [
  {
    id: 'b',
    name: 'National B Director License',
    short: 'B',
    tagline: 'The basics of the pit wall: pace, traffic and tires.',
    requires: null,
  },
  {
    id: 'a',
    name: 'National A Director License',
    short: 'A',
    tagline: 'Duels, charges through the field and fuel strategy.',
    requires: 'b',
  },
  {
    id: 'ic',
    name: 'International C Director License',
    short: 'IC',
    tagline: 'Long-distance craft: tire windows and elite traffic.',
    requires: 'a',
  },
  {
    id: 'ia',
    name: 'International A Director License',
    short: 'IA',
    tagline: 'Beating aces with strategy alone.',
    requires: 'ic',
  },
  {
    id: 's',
    name: 'Super Director License',
    short: 'S',
    tagline: 'The complete race director. Perfection expected.',
    requires: 'ia',
  },
];

const rookies = (cars: string[]): Array<{ driverId: string; carId: string }> =>
  ['miller', 'sato', 'weber', 'rossi', 'tanaka', 'lindqvist', 'dubois']
    .slice(0, cars.length)
    .map((driverId, i) => ({ driverId, carId: cars[i] }));
const pros = (cars: string[]): Array<{ driverId: string; carId: string }> =>
  ['okafor', 'novak', 'reyes', 'kim', 'bauer', 'costa', 'yamada']
    .slice(0, cars.length)
    .map((driverId, i) => ({ driverId, carId: cars[i] }));
const aces = (cars: string[]): Array<{ driverId: string; carId: string }> =>
  ['vasseur', 'kowalski', 'ibarra', 'schmidt', 'fontaine', 'nakamura', 'hale']
    .slice(0, cars.length)
    .map((driverId, i) => ({ driverId, carId: cars[i] }));

export const LICENSE_TRIALS: TrialDef[] = [
  // ---- National B (loaner: Kestrel 1.5i)
  {
    id: 'b-1',
    licenseId: 'b',
    name: 'First Commands',
    desc: 'A short race against three rookies. Use pace commands to finish as high as you can.',
    carId: 'kestrel',
    trackId: 'tsubame',
    laps: 3,
    seed: 9001,
    ai: rookies(['kestrel', 'kestrel', 'kestrel']),
    objective: { type: 'position', gold: 1, silver: 2, bronze: 3 },
    rewardCr: [2500, 1200, 500],
  },
  {
    id: 'b-2',
    licenseId: 'b',
    name: 'Pace Discipline',
    desc: 'Solo against the clock. Push hard — but a spin will ruin the run.',
    carId: 'kestrel',
    trackId: 'oval',
    laps: 3,
    seed: 9002,
    ai: [],
    objective: { type: 'time', goldMult: 1.035, silverMult: 1.065, bronzeMult: 1.11 },
    rewardCr: [2500, 1200, 500],
  },
  {
    id: 'b-3',
    licenseId: 'b',
    name: 'Traffic 101',
    desc: 'Start last in an eight-car field. Carve through the rookies.',
    carId: 'vulpe',
    trackId: 'greenpark',
    laps: 3,
    seed: 9003,
    ai: rookies(['kestrel', 'kestrel', 'kestrel', 'kestrel', 'kestrel', 'kestrel', 'kestrel']),
    objective: { type: 'position', gold: 2, silver: 4, bronze: 6 },
    rewardCr: [3000, 1500, 600],
  },
  {
    id: 'b-4',
    licenseId: 'b',
    name: 'Tire Sense',
    desc: 'Worn-out rubber ages fast here. Balance pace against wear to set a time.',
    carId: 'kestrel',
    trackId: 'dustbowl',
    laps: 4,
    seed: 9004,
    ai: [],
    trackMods: { wearMult: 2.2 },
    objective: { type: 'time', goldMult: 1.05, silverMult: 1.08, bronzeMult: 1.13 },
    rewardCr: [3000, 1500, 600],
  },

  // ---- National A (loaner: Falcon RS Turbo)
  {
    id: 'a-1',
    licenseId: 'a',
    name: 'The Duel',
    desc: 'One against one, three laps. Beat a professional in equal machinery.',
    carId: 'falcon',
    trackId: 'greenpark',
    laps: 3,
    seed: 9101,
    ai: pros(['falcon']),
    objective: { type: 'duel', silverGapS: 2, bronzeGapS: 5 },
    rewardCr: [4000, 2000, 800],
  },
  {
    id: 'a-2',
    licenseId: 'a',
    name: 'Rhythm Section',
    desc: 'Copperline rewards clean, consistent laps. Set a time.',
    carId: 'falcon',
    trackId: 'copperline',
    laps: 3,
    seed: 9102,
    ai: [],
    objective: { type: 'time', goldMult: 1.035, silverMult: 1.065, bronzeMult: 1.11 },
    rewardCr: [4000, 2000, 800],
  },
  {
    id: 'a-3',
    licenseId: 'a',
    name: 'Through the Field',
    desc: 'Last on the grid, four laps, professional opposition. Charge.',
    carId: 'falcon',
    trackId: 'motegrand',
    laps: 4,
    seed: 9103,
    ai: pros(['falcon', 'serval', 'falcon', 'serval', 'falcon', 'falcon', 'serval']),
    objective: { type: 'position', gold: 2, silver: 3, bronze: 5 },
    rewardCr: [5000, 2500, 1000],
  },
  {
    id: 'a-4',
    licenseId: 'a',
    name: 'City Limits',
    desc: 'Narrow streets punish aggression. Bring the car home fast — and clean.',
    carId: 'falcon',
    trackId: 'kowloon',
    laps: 4,
    seed: 9104,
    ai: [],
    objective: { type: 'time', goldMult: 1.045, silverMult: 1.075, bronzeMult: 1.12 },
    rewardCr: [5000, 2500, 1000],
  },

  // ---- International C (loaner: Kite GT-Four)
  {
    id: 'ic-1',
    licenseId: 'ic',
    name: 'Slipstream School',
    desc: 'A duel on the fastest track we have. Use the tow, then time the pass.',
    carId: 'kite',
    trackId: 'lacourbe',
    laps: 2,
    seed: 9201,
    ai: pros(['kite']),
    objective: { type: 'duel', silverGapS: 2, bronzeGapS: 6 },
    rewardCr: [7000, 3500, 1400],
  },
  {
    id: 'ic-2',
    licenseId: 'ic',
    name: 'The Tire Window',
    desc: 'Ten laps on rubber that will not last. Find the pit window and set a time.',
    carId: 'kite',
    trackId: 'sonora',
    laps: 10,
    seed: 9202,
    ai: [],
    trackMods: { wearMult: 2.4 },
    objective: { type: 'time', goldMult: 1.1, silverMult: 1.14, bronzeMult: 1.2 },
    rewardCr: [8000, 4000, 1600],
  },
  {
    id: 'ic-3',
    licenseId: 'ic',
    name: 'Mountain Charge',
    desc: 'Five laps of Alpenstrasse from the back of a professional field.',
    carId: 'kite',
    trackId: 'alpenstrasse',
    laps: 4,
    seed: 9203,
    ai: pros(['kite', 'serval', 'kite', 'falcon', 'serval', 'kite', 'serval']),
    objective: { type: 'position', gold: 1, silver: 3, bronze: 5 },
    rewardCr: [8000, 4000, 1600],
  },
  {
    id: 'ic-4',
    licenseId: 'ic',
    name: 'Kaiserwald Baptism',
    desc: 'Two laps of the monster. Respect it and it will give you a time.',
    carId: 'kite',
    trackId: 'kaiserwald',
    laps: 2,
    seed: 9204,
    ai: [],
    objective: { type: 'time', goldMult: 1.045, silverMult: 1.075, bronzeMult: 1.12 },
    rewardCr: [9000, 4500, 1800],
  },

  // ---- International A (loaner: Phantom GT500)
  {
    id: 'ia-1',
    licenseId: 'ia',
    name: 'Ace Hunting',
    desc: 'Six laps, last on the grid, and every rival is an ace.',
    carId: 'phantom',
    trackId: 'fujimi',
    laps: 6,
    seed: 9301,
    ai: [
      ...aces(['phantom', 'phantom', 'phantom', 'phantom', 'phantom']),
      { driverId: 'novak', carId: 'phantom' },
      { driverId: 'kim', carId: 'phantom' },
    ],
    objective: { type: 'position', gold: 3, silver: 5, bronze: 6 },
    rewardCr: [12000, 6000, 2400],
  },
  {
    id: 'ia-2',
    licenseId: 'ia',
    name: 'Flat Out',
    desc: 'La Courbe, two laps, no traffic. Nowhere to hide from the stopwatch.',
    carId: 'phantom',
    trackId: 'lacourbe',
    laps: 2,
    seed: 9302,
    ai: [],
    objective: { type: 'time', goldMult: 1.035, silverMult: 1.065, bronzeMult: 1.11 },
    rewardCr: [12000, 6000, 2400],
  },
  {
    id: 'ia-3',
    licenseId: 'ia',
    name: 'The Champion Duel',
    desc: 'One on one against the best ace in the country, equal machinery.',
    carId: 'phantom',
    trackId: 'motegrand',
    laps: 4,
    seed: 9303,
    ai: [{ driverId: 'fontaine', carId: 'phantom' }],
    objective: { type: 'duel', silverGapS: 3, bronzeGapS: 8 },
    rewardCr: [14000, 7000, 2800],
  },
  {
    id: 'ia-4',
    licenseId: 'ia',
    name: 'Loose Surface',
    desc: 'Dustbowl Park, low grip, worn quickly. Direct a clean rally sprint.',
    carId: 'phantom',
    trackId: 'dustbowl',
    laps: 5,
    seed: 9304,
    ai: [],
    trackMods: { gripMult: 0.92, wearMult: 1.6 },
    objective: { type: 'time', goldMult: 1.06, silverMult: 1.09, bronzeMult: 1.14 },
    rewardCr: [14000, 7000, 2800],
  },

  // ---- Super (loaner: Arrow R1 Prototype)
  {
    id: 's-1',
    licenseId: 's',
    name: 'The Gauntlet',
    desc: 'Eight Arrows. Seven aces. You start last. Six laps of Han River.',
    carId: 'arrow',
    trackId: 'hanriver',
    laps: 6,
    seed: 9407,
    ai: aces(['arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow', 'arrow']),
    objective: { type: 'position', gold: 1, silver: 3, bronze: 5 },
    rewardCr: [20000, 10000, 4000],
  },
  {
    id: 's-2',
    licenseId: 's',
    name: 'Kaiserwald, Committed',
    desc: 'Three flying laps of the monster in the fastest car we own.',
    carId: 'arrow',
    trackId: 'kaiserwald',
    laps: 3,
    seed: 9402,
    ai: [],
    objective: { type: 'time', goldMult: 1.04, silverMult: 1.07, bronzeMult: 1.11 },
    rewardCr: [20000, 10000, 4000],
  },
  {
    id: 's-3',
    licenseId: 's',
    name: 'The Long Game',
    desc: 'Fifteen laps of Aria against aces. Tires will decide it — manage them.',
    carId: 'arrow',
    trackId: 'aria',
    laps: 14,
    seed: 9403,
    ai: aces(['arrow', 'arrow', 'phantom', 'arrow', 'phantom', 'arrow', 'phantom']),
    objective: { type: 'position', gold: 1, silver: 2, bronze: 3 },
    rewardCr: [24000, 12000, 5000],
  },
  {
    id: 's-4',
    licenseId: 's',
    name: 'The Perfect Race',
    desc: 'Win. Set the fastest lap. Zero driver mistakes. That is the standard.',
    carId: 'arrow',
    trackId: 'condorpass',
    laps: 6,
    seed: 9404,
    ai: aces(['arrow', 'phantom', 'phantom', 'phantom', 'phantom', 'phantom', 'arrow']),
    objective: { type: 'perfect' },
    rewardCr: [30000, 15000, 6000],
  },
];

export const LICENSE_BY_ID: Record<string, LicenseDef> = Object.fromEntries(
  LICENSES.map((l) => [l.id, l]),
);

export const TRIAL_BY_ID: Record<string, TrialDef> = Object.fromEntries(
  LICENSE_TRIALS.map((t) => [t.id, t]),
);

export function trialsOf(licenseId: LicenseId): TrialDef[] {
  return LICENSE_TRIALS.filter((t) => t.licenseId === licenseId);
}
