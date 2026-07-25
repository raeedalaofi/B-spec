// Audio. Entirely synthesised — no files, no download, no licensing.
//
// The previous version was six oscillator beeps and a two-oscillator drone.
// That is not a mix, it is a placeholder: nothing told you where the cars
// were, whether the race was tense, or that you were at a circuit at all.
//
// What is here now is a small mixing desk. A master chain feeds four buses —
// engines, ambience, effects and music — so anything can be ducked against
// anything else. The engines are per-car voices panned and attenuated by
// where the cars actually are relative to the player, ambience is filtered
// noise coloured by the circuit's biome, and the music is a drone that grows
// a pulse when the player is in a fight. All of it is generated at runtime,
// which keeps the build a hundred and fifty kilobytes rather than a hundred
// and fifty megabytes.

/** what the mixer needs to know about the race, once per HUD tick */
export interface AudioScene {
  /** player's speed as a fraction of the car's top speed */
  playerSpeedFrac: number;
  /** nearby rivals: signed along-track distance (m) and speed fraction */
  rivals: Array<{ distM: number; speedFrac: number; lateral: number }>;
  /** 0 = cruising alone, 1 = wheel to wheel */
  tension: number;
  /** how hard the player is cornering, 0..1 — drives tire scrub */
  cornering: number;
  underCaution: boolean;
  finished: boolean;
}

const ENGINE_VOICES = 4; // the player plus the three nearest rivals
const HEARING_RANGE_M = 140;

interface EngineVoice {
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
  filter: BiquadFilterNode;
}

class SoundManager {
  enabled = true;
  private ctx: AudioContext | null = null;

  private master: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;

  private voices: EngineVoice[] = [];
  private ambience: { src: AudioBufferSourceNode; filter: BiquadFilterNode } | null = null;
  private scrub: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private music: { osc: OscillatorNode[]; gain: GainNode; pulse: GainNode } | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicTension = 0;

  // -- graph ----------------------------------------------------------------

  private ac(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
      this.buildBuses(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private buildBuses(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = 0.9;
    // a gentle limiter so a busy moment cannot clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    master.connect(comp).connect(ctx.destination);

    const mk = (level: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(master);
      return g;
    };
    this.master = master;
    this.engineBus = mk(0.5);
    this.ambienceBus = mk(0.32);
    this.fxBus = mk(0.85);
    this.musicBus = mk(0.3);
  }

  /** one second of white noise, reused by ambience and tire scrub */
  private noise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }

  // -- one-shots ------------------------------------------------------------

  private tone(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType,
    delay = 0,
    freqTo?: number,
  ): void {
    const ctx = this.ac();
    if (!ctx || !this.fxBus) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.fxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** filtered noise burst — impacts, scrapes, crowd swells */
  private burst(
    dur: number,
    gain: number,
    freq: number,
    q: number,
    delay = 0,
    type: BiquadFilterType = 'bandpass',
  ): void {
    const ctx = this.ac();
    if (!ctx || !this.fxBus) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.fxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  click(): void {
    this.tone(1800, 0.03, 0.04, 'square');
  }

  countdownTick(): void {
    this.tone(660, 0.12, 0.12, 'sine');
  }

  greenFlag(): void {
    this.tone(880, 0.25, 0.14, 'sine');
    this.tone(1320, 0.35, 0.1, 'sine', 0.08);
    this.crowdSwell(1.6, 0.16);
  }

  goodSting(): void {
    this.tone(523, 0.1, 0.1, 'triangle');
    this.tone(784, 0.16, 0.1, 'triangle', 0.09);
    this.crowdSwell(1.1, 0.1);
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
    this.crowdSwell(2.6, 0.2);
  }

  /** a rising figure while two cars are side by side */
  tension(): void {
    this.tone(392, 0.16, 0.05, 'triangle');
    this.tone(466, 0.2, 0.05, 'triangle', 0.09);
  }

  impact(heavy: boolean): void {
    // a crunch is broadband noise plus a low thump, not a square wave
    this.burst(heavy ? 0.45 : 0.18, heavy ? 0.4 : 0.2, heavy ? 900 : 1800, 0.8);
    this.tone(heavy ? 78 : 130, heavy ? 0.3 : 0.14, heavy ? 0.2 : 0.1, 'sine', 0, heavy ? 40 : 80);
    if (heavy) this.crowdSwell(1.8, 0.14);
  }

  caution(): void {
    this.tone(330, 0.4, 0.1, 'sine');
    this.tone(330, 0.4, 0.1, 'sine', 0.5);
  }

  radioIn(): void {
    // the squelch click of a radio opening
    this.burst(0.05, 0.16, 2600, 4);
    this.tone(1400, 0.04, 0.05, 'square', 0.03);
  }

  /** crowd noise rising and falling */
  private crowdSwell(dur: number, gain: number): void {
    this.burst(dur, gain, 700, 0.6, 0, 'lowpass');
  }

  // -- the running mix ------------------------------------------------------

  /** start the race audio: engines, ambience and music */
  startEngine(biome = 'meadow'): void {
    const ctx = this.ac();
    if (!ctx || this.voices.length) return;

    for (let i = 0; i < ENGINE_VOICES; i++) {
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const pan = ctx.createStereoPanner();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      sub.type = 'square';
      osc.frequency.value = 70;
      sub.frequency.value = 35;
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      gain.gain.value = 0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(pan).connect(this.engineBus!);
      osc.start();
      sub.start();
      this.voices.push({ osc, sub, gain, pan, filter });
    }

    // ambience bed: looping noise, filtered to suit the setting
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = biomeCutoff(biome);
    filter.Q.value = 0.6;
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.05;
    src.connect(filter).connect(bedGain).connect(this.ambienceBus!);
    src.start();
    this.ambience = { src, filter };

    // tire scrub: the same noise, band-passed, opened by cornering load
    const scrubSrc = ctx.createBufferSource();
    scrubSrc.buffer = this.noise(ctx);
    scrubSrc.loop = true;
    const scrubFilter = ctx.createBiquadFilter();
    scrubFilter.type = 'bandpass';
    scrubFilter.frequency.value = 2400;
    scrubFilter.Q.value = 2.5;
    const scrubGain = ctx.createGain();
    scrubGain.gain.value = 0;
    scrubSrc.connect(scrubFilter).connect(scrubGain).connect(this.fxBus!);
    scrubSrc.start();
    this.scrub = { src: scrubSrc, gain: scrubGain };

    this.startMusic(ctx);
  }

  /**
   * An adaptive bed: a low drone that is always there, plus a pulse that
   * fades in when the player is in a fight. Deliberately sparse — a race is
   * mostly listened to for the engines, and music that competes with them
   * makes the whole mix worse.
   */
  private startMusic(ctx: AudioContext): void {
    if (this.music) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    gain.connect(this.musicBus!);

    const drone: OscillatorNode[] = [];
    for (const [freq, type] of [
      [55, 'sine'],
      [82.5, 'sine'],
      [110, 'triangle'],
    ] as Array<[number, OscillatorType]>) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      osc.connect(g).connect(gain);
      osc.start();
      drone.push(osc);
    }

    // the pulse: an LFO-gated fifth that only opens up under tension
    const pulse = ctx.createGain();
    pulse.gain.value = 0;
    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = 'triangle';
    pulseOsc.frequency.value = 165;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 2.6;
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(pulse.gain);
    pulseOsc.connect(pulse).connect(gain);
    pulseOsc.start();
    lfo.start();
    drone.push(pulseOsc, lfo);

    this.music = { osc: drone, gain, pulse };
  }

  /**
   * Update the running mix from the race. Called at the HUD rate (~4 Hz) and
   * every parameter is ramped, so the mix moves smoothly rather than
   * stepping between updates.
   */
  updateScene(scene: AudioScene): void {
    const ctx = this.ctx;
    if (!ctx || !this.voices.length) return;
    const t = ctx.currentTime;
    const ramp = 0.3;

    // voice 0 is always the player's car, dead centre and loudest
    this.setVoice(this.voices[0], scene.playerSpeedFrac, 1, 0, t, ramp);

    // the rest are the nearest rivals, attenuated and panned by where they
    // are relative to the player — which is what makes traffic audible
    const near = [...scene.rivals]
      .sort((a, b) => Math.abs(a.distM) - Math.abs(b.distM))
      .slice(0, ENGINE_VOICES - 1);
    for (let i = 1; i < this.voices.length; i++) {
      const rival = near[i - 1];
      if (!rival || Math.abs(rival.distM) > HEARING_RANGE_M) {
        this.setVoice(this.voices[i], 0, 0, 0, t, ramp);
        continue;
      }
      const closeness = 1 - Math.abs(rival.distM) / HEARING_RANGE_M;
      // a car ahead sounds different from one on your door: pan by which
      // side of the road it is on, and drop the level as it recedes
      this.setVoice(
        this.voices[i],
        rival.speedFrac,
        0.55 * closeness * closeness,
        Math.max(-1, Math.min(1, rival.lateral)),
        t,
        ramp,
      );
    }

    if (this.scrub) {
      this.scrub.gain.gain.linearRampToValueAtTime(
        scene.underCaution ? 0 : 0.05 * scene.cornering * scene.playerSpeedFrac,
        t + ramp,
      );
    }
    if (this.ambience) {
      // the crowd and the trackside get quieter when the field slows down
      this.ambience.filter.frequency.linearRampToValueAtTime(
        scene.underCaution ? 600 : 1200 + 1400 * scene.playerSpeedFrac,
        t + ramp,
      );
    }
    if (this.music) {
      this.musicTension += (scene.tension - this.musicTension) * 0.25;
      this.music.gain.gain.linearRampToValueAtTime(
        scene.finished ? 0.2 : 0.35 + 0.4 * this.musicTension,
        t + ramp,
      );
      this.music.pulse.gain.cancelScheduledValues(t);
      this.music.pulse.gain.linearRampToValueAtTime(0.16 * this.musicTension, t + ramp);
    }
    if (this.engineBus) {
      this.engineBus.gain.linearRampToValueAtTime(scene.underCaution ? 0.22 : 0.5, t + ramp);
    }
  }

  private setVoice(
    voice: EngineVoice,
    speedFrac: number,
    level: number,
    pan: number,
    t: number,
    ramp: number,
  ): void {
    const f = 55 + 175 * Math.max(0, Math.min(1, speedFrac));
    voice.osc.frequency.linearRampToValueAtTime(f, t + ramp);
    voice.sub.frequency.linearRampToValueAtTime(f / 2, t + ramp);
    // the engine opens up as it revs, rather than just getting higher
    voice.filter.frequency.linearRampToValueAtTime(320 + 900 * speedFrac, t + ramp);
    voice.gain.gain.linearRampToValueAtTime(0.03 * level, t + ramp);
    voice.pan.pan.linearRampToValueAtTime(pan * 0.8, t + ramp);
  }

  stopEngine(): void {
    for (const v of this.voices) {
      v.osc.stop();
      v.sub.stop();
    }
    this.voices = [];
    this.ambience?.src.stop();
    this.ambience = null;
    this.scrub?.src.stop();
    this.scrub = null;
    for (const osc of this.music?.osc ?? []) osc.stop();
    this.music = null;
    this.musicTension = 0;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.stopEngine();
      if (this.master) this.master.gain.value = 0;
    } else if (this.master) {
      this.master.gain.value = 0.9;
    }
  }
}

/** each setting sounds different: a canyon is not a city street */
function biomeCutoff(biome: string): number {
  switch (biome) {
    case 'city':
      return 2600; // hard surfaces, bright reflections
    case 'forest-mountain':
      return 900; // trees absorb everything above a murmur
    case 'dirt':
      return 1400;
    case 'speedway':
      return 2000; // big crowd, open bowl
    default:
      return 1600;
  }
}

export const SOUND = new SoundManager();
