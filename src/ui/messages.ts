// Maps typed RaceEvents to English broadcast-style strings for the race
// message feed. The sim itself never formats text.

import type { RaceEvent, RaceState } from '../sim/types';

function driver(state: RaceState, carId: string): string {
  return state.cars.find((c) => c.carId === carId)?.driverName ?? carId;
}

function fmtLap(t: number): string {
  const m = Math.floor(t / 60);
  return `${m}'${(t - m * 60).toFixed(3).padStart(6, '0')}`;
}

export type MessageTone = 'normal' | 'good' | 'bad' | 'highlight';

export interface RaceMessage {
  text: string;
  tone: MessageTone;
}

export function messageFor(state: RaceState, e: RaceEvent): RaceMessage | null {
  const isPlayer = (id: string): boolean =>
    state.cars.find((c) => c.carId === id)?.isPlayer ?? false;
  switch (e.type) {
    case 'GREEN_FLAG':
      return { text: 'GREEN FLAG! The race is underway.', tone: 'highlight' };
    case 'OVERTAKE': {
      const where = e.zoneName ? ` into ${e.zoneName}` : '';
      const tone = isPlayer(e.carId) ? 'good' : isPlayer(e.passedId) ? 'bad' : 'normal';
      return {
        text: `${driver(state, e.carId)} passes ${driver(state, e.passedId)} for P${e.forPosition}${where}!`,
        tone,
      };
    }
    case 'OVERTAKE_ATTEMPT_FAILED':
      return {
        text: `${driver(state, e.carId)} looks at ${driver(state, e.defenderId)} — the door is closed.`,
        tone: isPlayer(e.carId) ? 'bad' : 'normal',
      };
    case 'BATTLE_STARTED':
      return {
        text: `${driver(state, e.carId)} is all over the back of ${driver(state, e.aheadId)}.`,
        tone: isPlayer(e.carId) || isPlayer(e.aheadId) ? 'highlight' : 'normal',
      };
    case 'MISTAKE': {
      const who = driver(state, e.carId);
      const text =
        e.severity === 'spin'
          ? `${who} SPINS at ${e.cornerName}!`
          : e.severity === 'major'
            ? `A big moment for ${who} at ${e.cornerName} — that cost time.`
            : `${who} runs wide at ${e.cornerName}.`;
      return { text, tone: isPlayer(e.carId) ? 'bad' : 'normal' };
    }
    case 'LAP_COMPLETE':
      if (e.isRaceFastest && e.lap > 1) {
        return {
          text: `FASTEST LAP — ${driver(state, e.carId)}, ${fmtLap(e.lapTimeS)}.`,
          tone: isPlayer(e.carId) ? 'good' : 'highlight',
        };
      }
      return null;
    case 'PIT_IN':
      return { text: `${driver(state, e.carId)} peels into the pit lane.`, tone: 'normal' };
    case 'PIT_OUT':
      return {
        text: `${driver(state, e.carId)} rejoins after a ${e.stopTimeS.toFixed(1)}s stop.`,
        tone: 'normal',
      };
    case 'TIRE_WARNING':
      return {
        text:
          e.wear > 0.8
            ? 'Tires are falling off the cliff — box this lap?'
            : 'Tires are going off. Watch the lap times.',
        tone: 'bad',
      };
    case 'FUEL_WARNING':
      return { text: `Fuel critical — about ${Math.max(1, Math.floor(e.lapsLeft))} lap(s) left.`, tone: 'bad' };
    case 'OUT_OF_FUEL':
      return { text: `${driver(state, e.carId)} is OUT OF FUEL and crawling!`, tone: 'bad' };
    case 'FINISH':
      if (e.position === 1) {
        return { text: `${driver(state, e.carId)} WINS the race!`, tone: 'highlight' };
      }
      return isPlayer(e.carId)
        ? { text: `You are classified P${e.position}.`, tone: e.position <= 3 ? 'good' : 'normal' }
        : null;
    default:
      return null;
  }
}
