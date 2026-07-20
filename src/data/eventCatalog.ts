// The standalone event catalog — generated deterministically at load from
// the track roster and car classes. Together with the championships,
// licenses and missions this pushes the game past 200 distinct events:
//   · Track Trophies: every circuit × class C/B/A (+ reverse-layout GP
//     trophies for holders of the IA license)
//   · Endurance Series: long races where pit strategy decides everything
//   · Rally Sprints: loose-surface events with brutal tire wear
//   · Super League: the hardest single races in the game

import type { CarClass } from '../sim/types';
import { AI_DRIVERS } from './aidrivers';
import type { LicenseId } from './licenses';
import { TRACK_DEFS } from './tracks';

export type CatalogCategory = 'trophy' | 'trophy-reverse' | 'endurance' | 'rally' | 'super';

export interface StandaloneEventDef {
  id: string;
  name: string;
  category: CatalogCategory;
  trackId: string;
  laps: number;
  aiDriverIds: string[];
  aiCarIds: string[];
  prize: number[];
  allowedClasses: CarClass[];
  licenseReq?: LicenseId;
  ppMax?: number;
  trackMods?: { gripMult?: number; wearMult?: number };
  desc: string;
}

const ROOKIES = AI_DRIVERS.slice(0, 7).map((d) => d.id);
const PROS = AI_DRIVERS.slice(7, 14).map((d) => d.id);
const ACES = AI_DRIVERS.slice(14, 21).map((d) => d.id);

const CLASS_CARS: Record<CarClass, string[]> = {
  C: ['kestrel', 'vulpe', 'taro'],
  B: ['falcon', 'serval', 'kite'],
  A: ['phantom', 'arrow'],
};

function rotate<T>(arr: T[], by: number): T[] {
  const n = arr.length;
  return arr.map((_, i) => arr[(i + by) % n]);
}

function fieldCars(cls: CarClass, idx: number): string[] {
  const pool = CLASS_CARS[cls];
  // bias toward the class's entry cars so the field is beatable stock-ish
  const weighted =
    cls === 'A'
      ? ['phantom', 'phantom', 'phantom', 'phantom', 'arrow', 'phantom', 'phantom']
      : [pool[0], pool[0], pool[1], pool[0], pool[1], pool[0], pool[2]];
  return rotate(weighted, idx % weighted.length);
}

const TROPHY_META: Record<
  CarClass,
  { roster: string[]; targetKm: number; prize1: number; licenseReq?: LicenseId; ppMax?: number }
> = {
  C: { roster: ROOKIES, targetKm: 16, prize1: 3200, ppMax: 575 },
  B: { roster: PROS, targetKm: 20, prize1: 6500, licenseReq: 'b', ppMax: 635 },
  A: { roster: ACES, targetKm: 26, prize1: 13000, licenseReq: 'a' },
};

function prizeTable(first: number): number[] {
  return [1, 0.7, 0.52, 0.4, 0.3, 0.22, 0.16, 0.12].map((f) => Math.round((first * f) / 100) * 100);
}

function lapsFor(trackId: string, targetKm: number, min = 2, max = 16): number {
  const lengthM = trackLengthEstimate(trackId);
  return Math.max(min, Math.min(max, Math.round((targetKm * 1000) / lengthM)));
}

// track length is only known after compilation; estimate from the polygon
// perimeter (compile-accurate enough for lap-count decisions)
const lengthCache = new Map<string, number>();
function trackLengthEstimate(trackId: string): number {
  const baseId = trackId.replace(/-r$/, '');
  const hit = lengthCache.get(baseId);
  if (hit) return hit;
  const pts = TRACK_DEFS[baseId].controlPoints;
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  len *= 1.05; // splines run slightly longer than the polygon
  lengthCache.set(baseId, len);
  return len;
}

function buildTrophies(): StandaloneEventDef[] {
  const out: StandaloneEventDef[] = [];
  const trackIds = Object.keys(TRACK_DEFS);
  for (const cls of ['C', 'B', 'A'] as CarClass[]) {
    const meta = TROPHY_META[cls];
    trackIds.forEach((trackId, i) => {
      out.push({
        id: `trophy-${cls.toLowerCase()}-${trackId}`,
        name: `${TRACK_DEFS[trackId].name} Trophy ${cls}`,
        category: 'trophy',
        trackId,
        laps: lapsFor(trackId, meta.targetKm),
        aiDriverIds: rotate(meta.roster, i),
        aiCarIds: fieldCars(cls, i),
        prize: prizeTable(meta.prize1),
        allowedClasses: [cls],
        licenseReq: meta.licenseReq,
        ppMax: meta.ppMax,
        desc: `Single-race trophy for Class ${cls} machinery.`,
      });
    });
  }
  return out;
}

/** reverse-layout GP trophies — class A, IA license (shirakawa's reverse
 *  direction has no clean overtaking zone, so it sits this series out) */
const REVERSE_TRACKS = [
  'oval', 'greenpark', 'copperline', 'aria', 'tsubame', 'fujimi', 'motegrand',
  'condorpass', 'sonora', 'neonspeedway', 'newport', 'lumiere', 'kowloon',
  'hanriver', 'alpenstrasse', 'kaiserwald', 'lacourbe', 'dustbowl',
];

function buildReverseTrophies(): StandaloneEventDef[] {
  return REVERSE_TRACKS.map((baseId, i) => ({
    id: `trophy-r-${baseId}`,
    name: `${TRACK_DEFS[baseId].name} II GP`,
    category: 'trophy-reverse' as const,
    trackId: `${baseId}-r`,
    laps: lapsFor(baseId, 26),
    aiDriverIds: rotate(ACES, i),
    aiCarIds: fieldCars('A', i + 3),
    prize: prizeTable(15000),
    allowedClasses: ['A' as CarClass],
    licenseReq: 'ia' as LicenseId,
    desc: 'The circuit run in reverse — every braking point is new.',
  }));
}

const ENDURANCE_SPECS: Array<{ trackId: string; km: number; cls: CarClass }> = [
  { trackId: 'greenpark', km: 60, cls: 'B' },
  { trackId: 'oval', km: 70, cls: 'B' },
  { trackId: 'sonora', km: 65, cls: 'B' },
  { trackId: 'motegrand', km: 75, cls: 'B' },
  { trackId: 'fujimi', km: 80, cls: 'A' },
  { trackId: 'shirakawa', km: 80, cls: 'A' },
  { trackId: 'aria', km: 85, cls: 'A' },
  { trackId: 'hanriver', km: 85, cls: 'A' },
  { trackId: 'condorpass', km: 75, cls: 'A' },
  { trackId: 'lacourbe', km: 110, cls: 'A' },
  { trackId: 'alpenstrasse', km: 90, cls: 'A' },
  { trackId: 'kaiserwald', km: 120, cls: 'A' },
];

function buildEndurance(): StandaloneEventDef[] {
  return ENDURANCE_SPECS.map((spec, i) => {
    const laps = lapsFor(spec.trackId, spec.km, 8, 45);
    return {
      id: `endurance-${spec.trackId}`,
      name: `${TRACK_DEFS[spec.trackId].name} ${spec.km} km`,
      category: 'endurance' as const,
      trackId: spec.trackId,
      laps,
      aiDriverIds: rotate(spec.cls === 'A' ? ACES : PROS, i),
      aiCarIds: fieldCars(spec.cls, i + 1),
      prize: prizeTable(spec.cls === 'A' ? 30000 : 18000),
      allowedClasses: [spec.cls],
      licenseReq: 'ic' as LicenseId,
      trackMods: { wearMult: 1.25 },
      desc: `${laps} laps. Tires will not last — the race is won in the pit window.`,
    };
  });
}

const RALLY_TRACKS = [
  'dustbowl', 'tsubame', 'sonora', 'condorpass', 'greenpark',
  'copperline', 'alpenstrasse', 'kowloon', 'motegrand', 'dustbowl-r',
];

function buildRally(): StandaloneEventDef[] {
  return RALLY_TRACKS.map((trackId, i) => ({
    id: `rally-${trackId}`,
    name: `${TRACK_DEFS[trackId.replace(/-r$/, '')].name} Rally Sprint${trackId.endsWith('-r') ? ' II' : ''}`,
    category: 'rally' as const,
    trackId,
    laps: lapsFor(trackId, 13, 3, 8),
    aiDriverIds: rotate(i < 5 ? PROS : ACES, i),
    aiCarIds: fieldCars('B', i),
    prize: prizeTable(9000),
    allowedClasses: ['B' as CarClass],
    licenseReq: 'a' as LicenseId,
    trackMods: { gripMult: 0.8, wearMult: 1.6 },
    desc: 'Loose surface: low grip, huge wear, mistakes everywhere.',
  }));
}

const SUPER_SPECS: Array<{ trackId: string; laps: number; name: string }> = [
  { trackId: 'kaiserwald', laps: 5, name: 'Kaiserwald Grand Slam' },
  { trackId: 'lacourbe', laps: 8, name: 'La Courbe Flat-Out 8' },
  { trackId: 'shirakawa', laps: 12, name: 'Shirakawa Masters' },
  { trackId: 'fujimi', laps: 12, name: 'Fujimi Super 12' },
  { trackId: 'aria', laps: 14, name: 'Aria Super Final' },
  { trackId: 'hanriver', laps: 12, name: 'Han River Night Super' },
  { trackId: 'condorpass', laps: 14, name: 'Condor Pass Super Sprint' },
  { trackId: 'motegrand', laps: 12, name: 'Motegrand Super Duel' },
];

function buildSuper(): StandaloneEventDef[] {
  return SUPER_SPECS.map((spec, i) => ({
    id: `super-${spec.trackId}`,
    name: spec.name,
    category: 'super' as const,
    trackId: spec.trackId,
    laps: spec.laps,
    aiDriverIds: rotate(ACES, i),
    aiCarIds: rotate(['arrow', 'arrow', 'arrow', 'phantom', 'arrow', 'arrow', 'arrow'], i),
    prize: prizeTable(40000),
    allowedClasses: ['A' as CarClass],
    licenseReq: 's' as LicenseId,
    desc: 'The Super License field: nothing but aces in prototypes.',
  }));
}

export const CATALOG: Record<CatalogCategory, StandaloneEventDef[]> = {
  trophy: buildTrophies(),
  'trophy-reverse': buildReverseTrophies(),
  endurance: buildEndurance(),
  rally: buildRally(),
  super: buildSuper(),
};

export const STANDALONE_BY_ID: Record<string, StandaloneEventDef> = Object.fromEntries(
  Object.values(CATALOG)
    .flat()
    .map((e) => [e.id, e]),
);

export const CATEGORY_INFO: Array<{
  id: CatalogCategory;
  title: string;
  sub: string;
}> = [
  { id: 'trophy', title: 'Track Trophies', sub: 'Every circuit, every class — 57 single-race trophies' },
  { id: 'trophy-reverse', title: 'Reverse GP', sub: 'The circuits mirrored — for IA license holders' },
  { id: 'endurance', title: 'Endurance Series', sub: 'Long-haul races decided by pit strategy' },
  { id: 'rally', title: 'Rally Sprints', sub: 'Loose surfaces, huge wear, total chaos' },
  { id: 'super', title: 'Super League', sub: 'The hardest single races in the game' },
];
