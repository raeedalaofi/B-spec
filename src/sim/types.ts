// Core simulation types. This module (and everything in src/sim/) is pure:
// no DOM, no Canvas, no Math.random. All units are SI (meters, m/s, kg, seconds).

export type CarClass = 'C' | 'B' | 'A';

export interface CarSpec {
  id: string;
  name: string;
  class: CarClass;
  priceCr: number;
  powerKw: number;
  massKg: number;
  /** 0.90..1.20 — multiplies lateral/braking grip */
  grip: number;
  topSpeedMs: number;
  /** lumped drag deceleration coefficient: a_drag = dragCoeff * v^2 (1/m) */
  dragCoeff: number;
  tireWearMult: number;
  fuelMult: number;
  /** liters */
  fuelTankL: number;
  color: string;
}

/** all 0..100 */
export interface DriverStats {
  pace: number;
  consistency: number;
  battle: number;
  smoothness: number;
  stamina: number;
}

export interface DriverSpec {
  name: string;
  stats: DriverStats;
}

// ---------------------------------------------------------------------------
// Track

export interface TrackDef {
  id: string;
  name: string;
  /** closed loop of control points, meters (centripetal Catmull-Rom) */
  controlPoints: ReadonlyArray<readonly [number, number]>;
  /** elevation (m) per control point; omit for a flat track */
  elevations?: ReadonlyArray<number>;
  /** visual ribbon width */
  widthM: number;
  pit: {
    /** normalized [0..1) lap position of pit entry / exit */
    entryT: number;
    exitT: number;
    /** drive-through time loss at pit limiter (s), excluding stationary time */
    laneTimeLossS: number;
  };
  /** 0.9..1.1 surface grip multiplier */
  gripBase: number;
  /** tire wear fraction (0..1) per lap at pace 3 for wearMult 1 */
  tireWearBase: number;
  /** liters per lap at pace 3 for fuelMult 1 */
  fuelBase: number;
}

export interface TrackSample {
  s: number;
  x: number;
  y: number;
  heading: number;
  curvature: number;
  /** corner speed cap for reference grip 1.0 (m/s) */
  vCapBase: number;
  /** elevation above datum (m) */
  elev: number;
  /** signed gradient dElev/ds (positive = uphill) */
  grade: number;
}

export interface CornerZone {
  name: string;
  entryS: number;
  apexS: number;
  exitS: number;
  /** m/s at apex for reference car */
  apexSpeed: number;
  /** 0.7 easy .. 1.4 hairpin — scales mistake probability */
  severity: number;
}

export interface OvertakeZone {
  name: string;
  startS: number;
  endS: number;
  /** 0.2 easy (long straight) .. 1.0 hard */
  difficulty: number;
}

export interface Track {
  def: TrackDef;
  lengthM: number;
  /** stride sampleStepM meters */
  samples: TrackSample[];
  sampleStepM: number;
  corners: CornerZone[];
  overtakingZones: OvertakeZone[];
}

// ---------------------------------------------------------------------------
// Race state

export type PaceLevel = 1 | 2 | 3 | 4 | 5;

export type Command =
  | { type: 'SET_PACE'; carId: string; level: PaceLevel }
  | { type: 'OVERTAKE_MODE'; carId: string; on: boolean }
  | { type: 'PIT'; carId: string; tires: boolean; refuel: boolean };

export type BattlePhase = 'CATCHING' | 'FOLLOWING' | 'PASSING';

export interface BattleState {
  phase: BattlePhase;
  /** carId of the car ahead */
  targetId: string;
  /** seconds remaining in PASSING before forced resolution */
  passingTimer: number;
  /** overtake zones to skip after a failed attempt */
  attemptCooldown: number;
  /** index of last overtake zone attempted (to roll once per zone pass) */
  lastZoneTried: number;
  /** ticks of continuous slipstream on the current straight */
  slipstreamTicks: number;
  /** seconds of post-failed-attempt slowdown remaining */
  penaltyTimer: number;
  /** overtaking zone name where the current pass attempt started */
  zoneName: string;
}

export interface PitState {
  phase: 'requested' | 'in-lane';
  tires: boolean;
  refuel: boolean;
  /** total seconds for entry→exit traversal (lane loss + stationary) */
  totalS: number;
  /** remaining seconds in lane */
  timer: number;
  /** arc positions captured at entry */
  entryS: number;
  exitS: number;
}

export interface MistakeState {
  /** speed multiplier while recovering */
  factor: number;
  /** seconds remaining */
  timer: number;
  severity: 'minor' | 'major' | 'spin';
}

export interface CarRaceState {
  carId: string;
  spec: CarSpec;
  driverName: string;
  stats: DriverStats;
  isPlayer: boolean;
  /** per-sample ideal speed, precomputed at race start */
  profile: Float64Array;
  /** max of profile, for corner-weighting driver skill */
  profileMax: number;
  /** ideal lap time from the profile (s) */
  idealLapS: number;

  s: number;
  lap: number;
  /** total distance = lap * trackLen + s, maintained incrementally */
  totalDist: number;
  speed: number;
  lane: 0 | 1;

  paceCmd: PaceLevel;
  overtakeMode: boolean;

  tireWear: number;
  fuelL: number;
  fatigue: number;
  morale: number;

  battle: BattleState | null;
  /** true while another car is following/passing this one (set per tick) */
  underAttack: boolean;
  mistake: MistakeState | null;
  pit: PitState | null;
  pitCount: number;
  /** AI decision thresholds (null for the player's car) */
  ai: { wearThreshold: number; fuelLapsMin: number } | null;

  /** index into track.corners of the next corner entry ahead */
  nextCornerIdx: number;
  /** corner-noise multiplier currently applied */
  noise: number;
  /** apply noise while s < noiseUntilS (with wrap flag) */
  noiseUntilS: number;

  lapStartTime: number;
  lastLapS: number | null;
  bestLapS: number | null;

  finished: boolean;
  finishPosition: number | null;
  finishTime: number | null;

  raceStats: {
    overtakes: number;
    timesPassed: number;
    mistakes: number;
    lapsLed: number;
    fastestLap: boolean;
  };
}

export interface RaceConfig {
  track: Track;
  lapsTotal: number;
  seed: number;
  entries: RaceEntry[];
  /** grid order = entries order; player usually placed mid/rear */
}

export interface RaceEntry {
  carId: string;
  spec: CarSpec;
  driverName: string;
  stats: DriverStats;
  isPlayer: boolean;
  paceCmd?: PaceLevel;
}

export interface RaceState {
  tickCount: number;
  rngState: number;
  track: Track;
  lapsTotal: number;
  phase: 'countdown' | 'racing' | 'finished';
  /** seconds of countdown remaining */
  countdown: number;
  /** race clock (s), starts at green flag */
  raceTime: number;
  cars: CarRaceState[];
  fastestLap: { carId: string; timeS: number } | null;
  finishedCount: number;
}

// ---------------------------------------------------------------------------
// Events

export type RaceEvent =
  | { type: 'GREEN_FLAG' }
  | { type: 'LAP_COMPLETE'; carId: string; lap: number; lapTimeS: number; isPersonalBest: boolean; isRaceFastest: boolean }
  | { type: 'OVERTAKE'; carId: string; passedId: string; forPosition: number; zoneName: string }
  | { type: 'OVERTAKE_ATTEMPT_FAILED'; carId: string; defenderId: string; zoneName: string }
  | { type: 'BATTLE_STARTED'; carId: string; aheadId: string }
  | { type: 'MISTAKE'; carId: string; severity: 'minor' | 'major' | 'spin'; cornerName: string }
  | { type: 'PIT_IN'; carId: string }
  | { type: 'PIT_OUT'; carId: string; stopTimeS: number }
  | { type: 'TIRE_WARNING'; carId: string; wear: number }
  | { type: 'FUEL_WARNING'; carId: string; lapsLeft: number }
  | { type: 'OUT_OF_FUEL'; carId: string }
  | { type: 'FINISH'; carId: string; position: number };

export interface RaceResultRow {
  carId: string;
  driverName: string;
  carName: string;
  isPlayer: boolean;
  position: number;
  /** gap to winner (s); null if lapped */
  gapS: number | null;
  lapsDown: number;
  bestLapS: number | null;
  overtakes: number;
  mistakes: number;
  pitStops: number;
  fastestLap: boolean;
}

export interface RaceResult {
  trackId: string;
  laps: number;
  rows: RaceResultRow[];
}
