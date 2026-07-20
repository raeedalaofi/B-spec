// Tuning parts catalog. Parts are universal: prices scale with the car's
// base price, and within a category only the highest installed stage
// applies (each stage is bought separately, in order).

import type { CarSpec } from '../sim/types';

export type PartCategory = 'power' | 'weight' | 'tires' | 'aero' | 'gearbox';

export interface PartEffects {
  powerMult?: number;
  massMult?: number;
  gripAdd?: number;
  topSpeedMult?: number;
  dragMult?: number;
  tireWearMult?: number;
  fuelMult?: number;
}

export interface PartDef {
  id: string;
  name: string;
  category: PartCategory;
  stage: number;
  /** price as a fraction of the car's base price */
  priceFrac: number;
  desc: string;
  effects: PartEffects;
}

export const PART_CATEGORIES: Array<{ id: PartCategory; label: string }> = [
  { id: 'power', label: 'Engine' },
  { id: 'weight', label: 'Weight Reduction' },
  { id: 'tires', label: 'Tires' },
  { id: 'aero', label: 'Aerodynamics' },
  { id: 'gearbox', label: 'Transmission' },
];

export const PARTS: PartDef[] = [
  {
    id: 'power-1',
    name: 'Sports ECU',
    category: 'power',
    stage: 1,
    priceFrac: 0.08,
    desc: 'Remapped engine management. +6% power.',
    effects: { powerMult: 1.06 },
  },
  {
    id: 'power-2',
    name: 'Turbo Kit',
    category: 'power',
    stage: 2,
    priceFrac: 0.2,
    desc: 'Bolt-on forced induction. +14% power, slightly harder on tires.',
    effects: { powerMult: 1.14, tireWearMult: 1.05 },
  },
  {
    id: 'power-3',
    name: 'Race Engine Build',
    category: 'power',
    stage: 3,
    priceFrac: 0.38,
    desc: 'Full competition rebuild. +25% power, more tire wear and fuel use.',
    effects: { powerMult: 1.25, tireWearMult: 1.1, fuelMult: 1.08 },
  },
  {
    id: 'weight-1',
    name: 'Lightweight Panels',
    category: 'weight',
    stage: 1,
    priceFrac: 0.1,
    desc: 'Composite body panels. −4% weight.',
    effects: { massMult: 0.96 },
  },
  {
    id: 'weight-2',
    name: 'Full Strip-Out',
    category: 'weight',
    stage: 2,
    priceFrac: 0.24,
    desc: 'Interior removed, cage fitted. −9% weight.',
    effects: { massMult: 0.91 },
  },
  {
    id: 'tires-1',
    name: 'Sports Tires',
    category: 'tires',
    stage: 1,
    priceFrac: 0.12,
    desc: 'Stickier compound. +0.04 grip, +10% wear.',
    effects: { gripAdd: 0.04, tireWearMult: 1.1 },
  },
  {
    id: 'tires-2',
    name: 'Semi-Slicks',
    category: 'tires',
    stage: 2,
    priceFrac: 0.28,
    desc: 'Near-race rubber. +0.08 grip, +25% wear.',
    effects: { gripAdd: 0.08, tireWearMult: 1.25 },
  },
  {
    id: 'aero-1',
    name: 'Aero Kit',
    category: 'aero',
    stage: 1,
    priceFrac: 0.15,
    desc: 'Splitter and wing. −8% drag, +0.02 grip.',
    effects: { dragMult: 0.92, gripAdd: 0.02 },
  },
  {
    id: 'gearbox-1',
    name: 'Close-Ratio Gearbox',
    category: 'gearbox',
    stage: 1,
    priceFrac: 0.1,
    desc: 'Optimized ratios. +4% top speed and better acceleration out of corners.',
    effects: { topSpeedMult: 1.04 },
  },
];

export const PART_BY_ID: Record<string, PartDef> = Object.fromEntries(
  PARTS.map((p) => [p.id, p]),
);

export function partPrice(car: CarSpec, part: PartDef): number {
  return Math.round((car.priceCr * part.priceFrac) / 100) * 100;
}

/** highest installed stage per category */
export function activeParts(installedIds: string[]): PartDef[] {
  const best = new Map<PartCategory, PartDef>();
  for (const id of installedIds) {
    const part = PART_BY_ID[id];
    if (!part) continue;
    const cur = best.get(part.category);
    if (!cur || part.stage > cur.stage) best.set(part.category, part);
  }
  return [...best.values()];
}

/** the effective spec the simulation races with */
export function tunedSpec(spec: CarSpec, installedIds: string[]): CarSpec {
  const parts = activeParts(installedIds);
  if (parts.length === 0) return spec;
  let powerKw = spec.powerKw;
  let massKg = spec.massKg;
  let grip = spec.grip;
  let topSpeedMs = spec.topSpeedMs;
  let dragCoeff = spec.dragCoeff;
  let tireWearMult = spec.tireWearMult;
  let fuelMult = spec.fuelMult;
  for (const p of parts) {
    const e = p.effects;
    if (e.powerMult) powerKw *= e.powerMult;
    if (e.massMult) massKg *= e.massMult;
    if (e.gripAdd) grip += e.gripAdd;
    if (e.topSpeedMult) topSpeedMs *= e.topSpeedMult;
    if (e.dragMult) dragCoeff *= e.dragMult;
    if (e.tireWearMult) tireWearMult *= e.tireWearMult;
    if (e.fuelMult) fuelMult *= e.fuelMult;
  }
  // more power/less drag raises the physical top speed too
  const vDragLimit = Math.cbrt((powerKw * 1000) / (massKg * dragCoeff));
  return {
    ...spec,
    powerKw: Math.round(powerKw),
    massKg: Math.round(massKg),
    grip: Number(grip.toFixed(3)),
    topSpeedMs: Math.min(topSpeedMs, vDragLimit),
    dragCoeff,
    tireWearMult: Number(tireWearMult.toFixed(3)),
    fuelMult: Number(fuelMult.toFixed(3)),
  };
}

/** next purchasable stage in a category (stages must be bought in order) */
export function nextPartInCategory(
  category: PartCategory,
  installedIds: string[],
): PartDef | null {
  const owned = installedIds
    .map((id) => PART_BY_ID[id])
    .filter((p) => p && p.category === category);
  const maxStage = owned.reduce((max, p) => Math.max(max, p.stage), 0);
  return PARTS.find((p) => p.category === category && p.stage === maxStage + 1) ?? null;
}
