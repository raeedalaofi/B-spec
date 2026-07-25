// Synthesized audio — zero assets, pure WebAudio. Everything is generated:
// UI clicks, countdown beeps, race stings, a finish fanfare and an engine
// hum that tracks the player's speed. The AudioContext is created lazily on
// the first user gesture (browser autoplay policy).

class SoundManager {
  enabled = true;
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  private ac(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** short filtered blip — UI feedback */
  click(): void {
    this.tone(1800, 0.03, 0.04, 'square');
  }

  countdownTick(): void {
    this.tone(660, 0.12, 0.12, 'sine');
  }

  greenFlag(): void {
    this.tone(880, 0.25, 0.14, 'sine');
    this.tone(1320, 0.35, 0.1, 'sine', 0.08);
  }

  goodSting(): void {
    this.tone(523, 0.1, 0.1, 'triangle');
    this.tone(784, 0.16, 0.1, 'triangle', 0.09);
  }

  badSting(): void {
    this.tone(220, 0.2, 0.12, 'sawtooth');
    this.tone(185, 0.24, 0.1, 'sawtooth', 0.1);
  }

  pitChime(): void {
    this.tone(988, 0.09, 0.08, 'sine');
    this.tone(740, 0.12, 0.08, 'sine', 0.1);
  }

  fanfare(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.28, 0.12, 'triangle', i * 0.13));
  }

  /** rising two-note figure under a side-by-side move */
  tension(): void {
    this.tone(392, 0.16, 0.05, 'triangle');
    this.tone(466, 0.2, 0.05, 'triangle', 0.09);
  }

  impact(heavy: boolean): void {
    this.tone(heavy ? 90 : 150, heavy ? 0.35 : 0.16, heavy ? 0.16 : 0.09, 'square');
    this.tone(heavy ? 62 : 110, heavy ? 0.4 : 0.18, 0.1, 'sawtooth', 0.02);
  }

  caution(): void {
    // two slow yellow-flag notes, deliberately unlike the race stings
    this.tone(330, 0.4, 0.1, 'sine');
    this.tone(330, 0.4, 0.1, 'sine', 0.5);
  }

  /** the click that precedes a team-radio call */
  radioIn(): void {
    this.tone(1400, 0.04, 0.05, 'square');
    this.tone(900, 0.07, 0.05, 'square', 0.05);
  }

  private tone(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** start the race engine hum (idempotent) */
  startEngine(): void {
    const ctx = this.ac();
    if (!ctx || this.engineOsc) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    osc.frequency.value = 70;
    osc2.frequency.value = 35;
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    gain.gain.value = 0.028;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(ctx.destination);
    osc.start();
    osc2.start();
    this.engineOsc = osc;
    this.engineOsc2 = osc2;
    this.engineGain = gain;
  }

  /** speedFrac 0..1 — pitch follows the player's speed */
  setEngineSpeed(speedFrac: number, muted = false): void {
    if (!this.engineOsc || !this.ctx) return;
    const f = 55 + 160 * Math.max(0, Math.min(1, speedFrac));
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.linearRampToValueAtTime(f, t + 0.25);
    this.engineOsc2!.frequency.linearRampToValueAtTime(f / 2, t + 0.25);
    // under caution the field is cruising: drop the engine back in the mix
    this.engineGain?.gain.linearRampToValueAtTime(muted ? 0.012 : 0.028, t + 0.4);
  }

  stopEngine(): void {
    this.engineOsc?.stop();
    this.engineOsc2?.stop();
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stopEngine();
  }
}

export const SOUND = new SoundManager();
