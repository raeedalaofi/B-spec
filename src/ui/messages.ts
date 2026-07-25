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

/**
 * Deterministic variety: the same event on the same tick always produces the
 * same line, but consecutive events read differently. Without this the feed
 * degenerates into the same sentence repeated once per car per lap, which is
 * what makes a busy race feel like a stuck record rather than a broadcast.
 */
function pick(state: RaceState, salt: string, options: string[]): string {
  let h = state.tickCount * 2654435761;
  for (let i = 0; i < salt.length; i++) h = (h ^ salt.charCodeAt(i)) * 16777619;
  return options[Math.abs(h) % options.length];
}

export function messageFor(state: RaceState, e: RaceEvent): RaceMessage | null {
  const isPlayer = (id: string): boolean =>
    state.cars.find((c) => c.carId === id)?.isPlayer ?? false;
  const involved = (a: string, b: string): boolean => isPlayer(a) || isPlayer(b);
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
    case 'SIDE_BY_SIDE': {
      const att = driver(state, e.carId);
      const def = driver(state, e.defenderId);
      const where = e.zoneName ? ` into ${e.zoneName}` : '';
      return {
        text: pick(state, e.carId, [
          `${att} pulls out and goes for it${where} — side by side for P${e.forPosition}!`,
          `${att} is alongside ${def}${where}!`,
          `Here comes ${att} down the inside of ${def}${where}!`,
        ]),
        tone: involved(e.carId, e.defenderId) ? 'highlight' : 'normal',
      };
    }
    case 'OVERTAKE_ATTEMPT_FAILED': {
      const att = driver(state, e.carId);
      const def = driver(state, e.defenderId);
      return {
        text: pick(state, e.carId, [
          `${def} holds the line — ${att} has to tuck back in.`,
          `${att} runs out of road and concedes it back to ${def}.`,
          `No way through for ${att}; ${def} keeps the position.`,
        ]),
        tone: isPlayer(e.carId) ? 'bad' : 'normal',
      };
    }
    case 'BATTLE_STARTED': {
      const att = driver(state, e.carId);
      const ahead = driver(state, e.aheadId);
      return {
        text: pick(state, e.carId, [
          `${att} is all over the back of ${ahead}.`,
          `${att} closes right up on ${ahead}.`,
          `${ahead} has ${att} filling the mirrors now.`,
        ]),
        tone: involved(e.carId, e.aheadId) ? 'highlight' : 'normal',
      };
    }
    case 'CONTACT': {
      const a = driver(state, e.carId);
      const b = driver(state, e.otherId);
      return {
        text:
          e.severity === 'heavy'
            ? `CONTACT! ${a} and ${b} come together — both are hurt.`
            : `${a} and ${b} touch wheels — a scruffy moment for both.`,
        tone: involved(e.carId, e.otherId) ? 'bad' : 'normal',
      };
    }
    case 'RETIREMENT':
      return {
        text:
          e.reason === 'damage'
            ? `${driver(state, e.carId)} is out — the car has had enough.`
            : `${driver(state, e.carId)} retires from the race.`,
        tone: isPlayer(e.carId) ? 'bad' : 'normal',
      };
    case 'CAUTION_START':
      return {
        text: `FULL-COURSE CAUTION — ${e.cause}. ${e.lapsLeft} laps behind the safety car.`,
        tone: 'highlight',
      };
    case 'CAUTION_END':
      return { text: 'The caution is over — racing resumes next time by.', tone: 'highlight' };
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
