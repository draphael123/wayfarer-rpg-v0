/**
 * Hybrid audio kit: real CC0 recordings (per-stage music, foley SFX) loaded
 * lazily as MP3, with the original synthesized WebAudio kit as an instant
 * fallback while samples stream in (or if they fail to load).
 *
 * Music: medieval-fantasy & rpg-battle-system packs (Superpowers, CC0).
 * SFX: ninja-adventure & medieval-fantasy packs (Superpowers, CC0).
 */

type SfxName =
  | "click"
  | "slash"
  | "shoot"
  | "bolt"
  | "hit"
  | "thud"
  | "heal"
  | "fireball"
  | "frost"
  | "warcry"
  | "shield"
  | "coin"
  | "ready"
  | "roar"
  | "levelup"
  | "victory"
  | "defeat"
  | "wave"
  | "ultReady"
  | "ultChallenge"
  | "ultWhirlwind"
  | "ultVolley"
  | "ultBarrage"
  | "ultSanctuary"
  | "ultBlink"
  | "ultDuel"
  | "ultAegis"
  | "ultNova"
  | "ultShadows"
  | "relic"
  | "howl"
  | "warhorn"
  | "flawless"
  | "clink"
  | "page"
  | "tankard"
  | "staggerBreak"
  | "hitHeavy"
  | "spSunder"
  | "spOverpower"
  | "spGroundbreaker"
  | "spRush"
  | "spTwinshot"
  | "spCaltrops"
  | "spSmokebomb"
  | "spDeadeye"
  | "spMissiles"
  | "spChainspark"
  | "spGravity"
  | "spMeteor"
  | "spBlessing"
  | "spSunlance"
  | "spWard"
  | "spJudgement"
  | "spShieldslam"
  | "spSecondwind"
  | "spRamwall"
  | "spStoneskin"
  | "spBastion";

/** SFX that have recorded versions; each entry lists variants to pick from. */
const SAMPLE_SFX: Partial<Record<SfxName, string[]>> = {
  click: ["sfx-click", "sfx-click2"],
  coin: ["sfx-coin", "sfx-coin2"],
  slash: ["sfx-slash"],
  shoot: ["sfx-woosh", "sfx-woosh2"],
  bolt: ["sfx-magic"],
  roar: ["sfx-roar", "sfx-roar2"],
  ready: ["sfx-ready"],
  levelup: ["sfx-levelup"],
  victory: ["sfx-victory"],
  defeat: ["sfx-defeat"],
  wave: ["sfx-wave"],
};

const MUSIC_TRACKS = [
  "music-menu",
  "music-stage0",
  "music-stage1",
  "music-stage2",
  "music-stage3",
  "music-stage4",
  "music-stage5",
  "music-boss",
];

const ALL_SAMPLES = [...MUSIC_TRACKS, ...Object.values(SAMPLE_SFX).flat()];

/** Per-sample playback volume tweaks (samples are peak-normalized). */
const SAMPLE_VOLUME: Record<string, number> = {
  "sfx-click": 0.5,
  "sfx-click2": 0.5,
  "sfx-ready": 0.45,
  "sfx-wave": 0.55,
};

class AudioKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxOut: GainNode | null = null; // every effect/ambience routes here so a slider can scale them
  private musicVolNode: GainNode | null = null; // ditto for music, after the danger filter
  private sfxLevel = 1;
  private musicLevel = 1;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private mood: "menu" | "battle" = "menu";
  private stageId = 0;
  private bossActive = false;
  soundOn = true;
  musicOn = true;

  // ---- sample layer
  private samples = new Map<string, AudioBuffer>();
  private samplesRequested = false;
  private trackNode: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;

  // ---- ambience + danger ducking
  private musicOut: BiquadFilterNode | null = null;
  private dangerOn = false;
  private ambienceKind: "menu" | number | null = null;
  private ambienceTimer: number | null = null;
  private ambienceBed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  setMood(mood: "menu" | "battle", stageId?: number): void {
    this.mood = mood;
    if (stageId !== undefined) this.stageId = stageId;
    if (mood === "menu") {
      this.bossActive = false;
      this.setDanger(false);
    }
    this.syncMusic();
    this.setAmbience(mood === "menu" ? "menu" : this.stageId);
  }

  /** Muffle the music while a hero is at death's door. */
  setDanger(on: boolean): void {
    if (this.dangerOn === on) return;
    this.dangerOn = on;
    const ctx = this.ctx;
    if (!ctx || !this.musicOut) return;
    const f = this.musicOut.frequency;
    f.cancelScheduledValues(ctx.currentTime);
    f.setValueAtTime(Math.max(200, f.value), ctx.currentTime);
    f.exponentialRampToValueAtTime(on ? 620 : 18000, ctx.currentTime + 0.45);
  }

  // ---- ambience: quiet living beds under the music, per place

  private setAmbience(kind: "menu" | number | null): void {
    if (this.ambienceKind === kind) return;
    this.stopAmbience();
    const ctx = this.ctx;
    if (!ctx || kind === null || !this.soundOn || !this.master) {
      // not ready yet — leave kind unset so a later call re-arms
      this.ambienceKind = null;
      return;
    }
    this.ambienceKind = kind;
    // continuous bed: filtered noise loop (wind, rain, ember hush)
    const bedSpec: Record<string, { freq: number; gain: number } | undefined> = {
      menu: { freq: 420, gain: 0.02 },
      "0": { freq: 900, gain: 0.012 },
      "1": { freq: 700, gain: 0.016 },
      "2": { freq: 2400, gain: 0.035 }, // the rain players can finally hear
      "3": { freq: 780, gain: 0.022 },
      "4": { freq: 480, gain: 0.035 }, // night wind
      "5": { freq: 700, gain: 0.022 },
      "6": { freq: 520, gain: 0.028 },
      "7": { freq: 620, gain: 0.02 },
      "8": { freq: 480, gain: 0.024 },
      "9": { freq: 300, gain: 0.02 },
      "10": { freq: 700, gain: 0.05 },
      "11": { freq: 380, gain: 0.03 },
    };
    const spec = bedSpec[String(kind)];
    if (spec) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = spec.freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(spec.gain, ctx.currentTime + 1.2);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxOut ?? this.master);
      src.start();
      this.ambienceBed = { src, gain };
    }
    this.ambienceTimer = window.setInterval(() => this.ambiencePunctuate(), 1500);
  }

  private stopAmbience(): void {
    if (this.ambienceTimer !== null) {
      clearInterval(this.ambienceTimer);
      this.ambienceTimer = null;
    }
    if (this.ambienceBed && this.ctx) {
      const { src, gain } = this.ambienceBed;
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6);
      src.stop(this.ctx.currentTime + 0.7);
      this.ambienceBed = null;
    }
  }

  /** Occasional life: birdsong, frogs, owls, crackling embers. */
  private ambiencePunctuate(): void {
    if (!this.soundOn || this.ambienceKind === null) return;
    const roll = Math.random();
    const kind = this.ambienceKind;
    if (kind === "menu") {
      // campfire crackle
      if (roll < 0.85) {
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
          this.noise(0.02 + Math.random() * 0.03, 0.05 + Math.random() * 0.05, 1100 + Math.random() * 900, Math.random() * 0.9);
        }
      }
      return;
    }
    if (kind === 0 || kind === 1) {
      // meadow and forest birdsong
      if (roll < 0.4) {
        const base = 2100 + Math.random() * 700;
        this.tone(base, 0.07, "sine", 0.045, 320);
        this.tone(base + 260, 0.09, "sine", 0.04, -180, 0.11);
        if (Math.random() < 0.5) this.tone(base + 120, 0.06, "sine", 0.035, 240, 0.24);
      }
    } else if (kind === 2) {
      // swamp: drips and the odd frog
      if (roll < 0.45) {
        this.tone(940, 0.05, "sine", 0.05, -420);
        this.tone(300, 0.07, "sine", 0.045, 60, 0.07);
      } else if (roll < 0.6) {
        this.tone(150, 0.12, "sawtooth", 0.035, 26);
        this.tone(140, 0.1, "sawtooth", 0.03, 22, 0.16);
      }
    } else if (kind === 3 || kind === 5) {
      // burnt lands: embers pop, something rumbles far off
      if (roll < 0.55) {
        for (let i = 0; i < 2; i++) this.noise(0.03, 0.06, 1400 + Math.random() * 800, Math.random() * 0.8);
      } else if (roll < 0.65) {
        this.tone(52, 0.5, "sine", 0.05, -8);
      }
    } else if (kind === 4) {
      // gloaming: owls, and worse
      if (roll < 0.25) {
        this.tone(480, 0.16, "sine", 0.05, -30);
        this.tone(430, 0.22, "sine", 0.05, -25, 0.24);
      } else if (roll < 0.35) {
        this.tone(680, 0.18, "sawtooth", 0.03, -320);
      }
    }
  }

  /** Boss waves swap to the boss theme; cleared when the battle ends. */
  setBossMusic(on: boolean): void {
    if (this.bossActive === on) return;
    this.bossActive = on;
    this.syncMusic();
  }

  private desiredTrack(): string {
    if (this.mood === "menu") return "music-menu";
    if (this.bossActive) return "music-boss";
    const act2Music: Record<number, number> = { 6: 0, 7: 1, 8: 2, 9: 4, 10: 3, 11: 5 };
    const mapped = this.stageId >= 6 ? (act2Music[this.stageId] ?? 5) : this.stageId;
    return `music-stage${Math.max(0, Math.min(5, mapped))}`;
  }

  private ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.sfxOut = this.ctx.createGain();
      this.sfxOut.gain.value = this.sfxLevel;
      this.sfxOut.connect(this.master);
      // all music routes through one lowpass so danger can muffle the world
      this.musicOut = this.ctx.createBiquadFilter();
      this.musicOut.type = "lowpass";
      this.musicOut.frequency.value = 18000;
      this.musicVolNode = this.ctx.createGain();
      this.musicVolNode.gain.value = this.musicLevel;
      this.musicOut.connect(this.musicVolNode);
      this.musicVolNode.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.musicOut);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call from the first user gesture so the context is allowed to start. */
  unlock(): void {
    this.ensure();
    this.loadSamples();
    this.syncMusic();
    this.setAmbience(this.mood === "menu" ? "menu" : this.stageId);
    if (!this.trackNode) this.startMusic();
  }

  /** Fetch + decode every sample once; swap the music over as tracks arrive. */
  private loadSamples(): void {
    if (this.samplesRequested) return;
    this.samplesRequested = true;
    const ctx = this.ensure();
    if (!ctx) return;
    const overrides = (window as unknown as { __WAYBAND_AUDIO?: Record<string, string> }).__WAYBAND_AUDIO ?? {};
    for (const name of ALL_SAMPLES) {
      const url = overrides[name] ?? `audio/${name}.mp3`;
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
        .then((buf) => ctx.decodeAudioData(buf))
        .then((audio) => {
          this.samples.set(name, audio);
          if (name === this.desiredTrack()) this.syncMusic();
        })
        .catch(() => {
          /* stay on the synth fallback */
        });
    }
  }

  /** Crossfade the looped sample music to whatever the state wants. */
  private syncMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const want = this.desiredTrack();
    if (!this.musicOn) {
      this.stopTrack(0.3);
      return;
    }
    if (this.trackNode?.name === want) return;
    const buffer = this.samples.get(want);
    if (!buffer) return; // synth keeps playing until the file lands
    // stop the synth loop for good — samples own the music from here
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.stopTrack(0.7);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = 0.03;
    src.loopEnd = Math.max(0.1, buffer.duration - 0.06);
    const gain = ctx.createGain();
    const level = 0.32;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(level, ctx.currentTime + 0.8);
    src.connect(gain);
    gain.connect(this.musicOut ?? this.master);
    src.start();
    this.trackNode = { name: want, src, gain };
  }

  private stopTrack(fade: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.trackNode) return;
    const { src, gain } = this.trackNode;
    this.trackNode = null;
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fade);
    src.stop(ctx.currentTime + fade + 0.05);
  }

  private playSample(name: string, volume = 1): boolean {
    const ctx = this.ctx;
    const buffer = this.samples.get(name);
    if (!ctx || !this.master || !buffer) return false;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const gain = ctx.createGain();
    gain.gain.value = volume * (SAMPLE_VOLUME[name] ?? 0.75);
    src.connect(gain);
    gain.connect(this.sfxOut ?? this.master);
    src.start();
    return true;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    volume: number,
    slide = 0,
    delay = 0,
    dest?: AudioNode,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(dest ?? this.sfxOut ?? this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, volume: number, filterFreq: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxOut ?? this.master);
    src.start(t0);
  }

  /** Kill-streak chime: each quick kill climbs a semitone ladder. */
  killChime(streak: number): void {
    if (!this.soundOn) return;
    const freq = 523 * Math.pow(1.1225, Math.min(streak - 1, 8));
    this.tone(freq, 0.11, "triangle", 0.13, 40);
    if (streak >= 3) this.tone(freq * 1.5, 0.1, "sine", 0.08, 0, 0.05);
  }

  play(name: SfxName): void {
    if (!this.soundOn) return;
    // prefer a recorded variant when it has arrived
    const variants = SAMPLE_SFX[name];
    if (variants) {
      const pick = variants[Math.floor(Math.random() * variants.length)];
      if (this.playSample(pick)) return;
    }
    switch (name) {
      case "click":
        this.tone(660, 0.06, "square", 0.12, 120);
        break;
      // ---- ultimate voices: each calling's big moment sounds like itself
      case "ultReady":
        this.tone(523, 0.14, "triangle", 0.2, 60);
        this.tone(784, 0.18, "triangle", 0.2, 0, 0.1);
        this.tone(1046, 0.34, "sine", 0.16, 0, 0.2);
        break;
      case "ultChallenge":
        // war horn
        this.tone(196, 0.55, "sawtooth", 0.2, 26);
        this.tone(294, 0.55, "sawtooth", 0.13, 26, 0.02);
        this.noise(0.24, 0.1, 900);
        break;
      case "ultDuel":
        // six ringing strikes, quickening
        for (let i = 0; i < 6; i++) this.tone(660 + i * 60, 0.07, "square", 0.12, 30, i * 0.055);
        this.tone(1180, 0.3, "triangle", 0.12, -200, 0.36);
        break;
      case "ultAegis":
        // a warm wall of sound rising
        this.tone(196, 0.9, "triangle", 0.2, 40);
        this.tone(294, 0.8, "sine", 0.16, 30, 0.08);
        this.tone(392, 0.7, "sine", 0.14, 30, 0.16);
        this.tone(587, 0.6, "sine", 0.1, 0, 0.28);
        break;
      case "ultNova":
        // rune-charge released
        this.tone(880, 0.12, "sawtooth", 0.14, -500);
        this.noise(0.5, 0.22, 900);
        this.tone(110, 0.6, "sawtooth", 0.18, -40, 0.06);
        break;
      case "ultShadows":
        // whispers crossing the field
        for (let i = 0; i < 5; i++) this.noise(0.12, 0.1, 2400 - i * 300, i * 0.07);
        this.tone(392, 0.4, "sine", 0.1, -120, 0.3);
        break;
      case "howl":
        // the pack's one voice, rising and falling on the night
        this.tone(340, 1.3, "sine", 0.16, 420);
        this.tone(346, 1.3, "sine", 0.1, 415, 0.03);
        this.tone(760, 0.7, "sine", 0.09, -260, 0.9);
        break;
      case "warhorn":
        // a horn that means the hollow itself is coming
        this.tone(147, 1.1, "sawtooth", 0.16, 12);
        this.tone(220, 1.0, "sawtooth", 0.1, 10, 0.1);
        this.noise(0.9, 0.05, 500, 0.05);
        break;
      case "flawless":
        // not a scratch on them
        for (let i = 0; i < 5; i++) this.tone(523 * Math.pow(1.1892, i), 0.14, "triangle", 0.11, 0, 0.5 + i * 0.09);
        this.tone(1568, 0.5, "sine", 0.09, 0, 0.98);
        break;
      case "clink":
        this.tone(1180, 0.05, "square", 0.09, -60);
        this.tone(1560, 0.09, "triangle", 0.08, -120, 0.03);
        break;
      case "page":
        this.noise(0.1, 0.08, 3200);
        this.noise(0.08, 0.06, 2200, 0.07);
        break;
      case "tankard":
        this.tone(220, 0.08, "square", 0.1, -40);
        this.noise(0.12, 0.06, 900, 0.05);
        this.tone(330, 0.1, "sine", 0.06, 20, 0.1);
        break;
      case "staggerBreak":
        // poise shattering like river ice
        this.noise(0.3, 0.18, 1600);
        this.tone(880, 0.1, "square", 0.12, -300);
        this.tone(220, 0.5, "sawtooth", 0.14, -60, 0.08);
        this.tone(1320, 0.4, "triangle", 0.1, -400, 0.14);
        break;
      case "relic":
        // something old changes hands
        this.tone(523, 0.16, "triangle", 0.16);
        this.tone(659, 0.16, "triangle", 0.16, 0, 0.14);
        this.tone(784, 0.2, "triangle", 0.16, 0, 0.28);
        this.tone(1047, 0.5, "sine", 0.14, 0, 0.42);
        break;
      case "ultWhirlwind":
        this.noise(0.34, 0.28, 1500);
        this.noise(0.26, 0.22, 2200, 0.12);
        this.tone(150, 0.34, "sawtooth", 0.15, -70);
        break;
      case "ultVolley":
        for (let i = 0; i < 4; i++) this.noise(0.08, 0.18, 3000, i * 0.07);
        this.tone(95, 0.16, "sine", 0.2, -30, 0.32);
        this.noise(0.12, 0.16, 800, 0.32);
        break;
      case "ultBarrage":
        for (let i = 0; i < 5; i++) this.tone(920 - i * 60, 0.12, "square", 0.1, -320, i * 0.07);
        this.noise(0.2, 0.08, 2600, 0.1);
        break;
      case "ultSanctuary":
        this.tone(523, 0.9, "sine", 0.11);
        this.tone(659, 0.9, "sine", 0.1, 0, 0.05);
        this.tone(784, 0.9, "sine", 0.09, 0, 0.1);
        this.tone(1046, 0.6, "triangle", 0.07, 0, 0.25);
        break;
      case "ultBlink":
        this.tone(1250, 0.09, "sine", 0.16, -850);
        this.noise(0.12, 0.16, 4200);
        this.tone(480, 0.1, "triangle", 0.14, 320, 0.12);
        break;
      case "hitHeavy":
        this.tone(85, 0.14, "sine", 0.2, -30);
        this.noise(0.09, 0.16, 800);
        break;
      // ---- spell voices: every spell sounds like itself
      case "spSunder":
        this.noise(0.08, 0.24, 3200);
        this.tone(180, 0.12, "square", 0.13, -60);
        this.tone(90, 0.1, "sine", 0.12, 0, 0.05);
        break;
      case "spOverpower":
        this.noise(0.1, 0.28, 2000);
        this.tone(120, 0.16, "square", 0.15, -50);
        break;
      case "spGroundbreaker":
        this.tone(58, 0.42, "sine", 0.28, -18);
        this.noise(0.3, 0.24, 500);
        this.noise(0.16, 0.18, 320, 0.16);
        break;
      case "spRush":
        this.noise(0.16, 0.22, 2400);
        this.tone(520, 0.1, "sawtooth", 0.1, -260, 0.1);
        this.noise(0.07, 0.2, 3200, 0.14);
        break;
      case "spTwinshot":
        this.noise(0.07, 0.2, 3000);
        this.noise(0.07, 0.2, 3300, 0.09);
        break;
      case "spCaltrops":
        for (let i = 0; i < 4; i++) this.noise(0.035, 0.14, 2500 + i * 300, i * 0.05);
        this.tone(1700, 0.05, "triangle", 0.07, -300, 0.08);
        break;
      case "spSmokebomb":
        this.noise(0.42, 0.2, 850);
        this.tone(220, 0.16, "sine", 0.08, -110);
        break;
      case "spDeadeye":
        this.tone(1400, 0.05, "square", 0.14, -900);
        this.noise(0.2, 0.26, 4200);
        this.tone(220, 0.32, "sine", 0.1, -120, 0.05);
        break;
      case "spMissiles":
        for (let i = 0; i < 3; i++) this.tone(900 - i * 60, 0.08, "square", 0.1, -420, i * 0.08);
        break;
      case "spChainspark":
        this.tone(1250, 0.09, "square", 0.11, -650);
        this.tone(950, 0.09, "square", 0.09, -520, 0.08);
        this.noise(0.14, 0.1, 5200);
        break;
      case "spGravity":
        this.tone(320, 0.6, "sine", 0.13, -190);
        this.tone(470, 0.6, "sine", 0.09, -270, 0.05);
        this.noise(0.5, 0.07, 550);
        break;
      case "spMeteor":
        // the whistle of something enormous falling
        this.tone(1500, 1.1, "sine", 0.11, -1150);
        this.noise(0.9, 0.06, 2400, 0.1);
        break;
      case "spBlessing":
        this.tone(660, 0.2, "triangle", 0.13, 80);
        this.tone(990, 0.3, "sine", 0.11, 0, 0.12);
        break;
      case "spSunlance":
        this.tone(523, 0.5, "sine", 0.13, 130);
        this.tone(1046, 0.42, "sine", 0.1, 0, 0.1);
        this.noise(0.28, 0.07, 2100);
        break;
      case "spWard":
        this.tone(880, 0.24, "triangle", 0.12);
        this.tone(1320, 0.34, "sine", 0.09, 0, 0.08);
        this.noise(0.2, 0.045, 5200);
        break;
      case "spJudgement":
        this.tone(392, 0.7, "sine", 0.11);
        this.tone(494, 0.7, "sine", 0.1, 0, 0.03);
        this.tone(587, 0.7, "sine", 0.09, 0, 0.06);
        this.noise(0.2, 0.12, 700, 0.05);
        break;
      case "spShieldslam":
        this.tone(400, 0.12, "square", 0.16, -160);
        this.noise(0.1, 0.2, 1500);
        this.tone(150, 0.1, "sine", 0.14);
        break;
      case "spSecondwind":
        this.noise(0.24, 0.1, 1100);
        this.tone(330, 0.3, "triangle", 0.12, 120, 0.15);
        break;
      case "spRamwall":
        this.tone(80, 0.3, "sawtooth", 0.16, 40);
        this.noise(0.12, 0.24, 700, 0.24);
        this.tone(58, 0.15, "sine", 0.18, 0, 0.24);
        break;
      case "spStoneskin":
        this.noise(0.3, 0.18, 550);
        this.tone(110, 0.26, "sawtooth", 0.09, -25);
        break;
      case "spBastion":
        this.tone(196, 0.5, "sawtooth", 0.15, 20);
        this.tone(294, 0.5, "sawtooth", 0.11, 20, 0.03);
        this.tone(1046, 0.3, "triangle", 0.09, 0, 0.3);
        break;
      case "slash":
        this.noise(0.09, 0.25, 2600);
        this.tone(220, 0.06, "sawtooth", 0.08, -80);
        break;
      case "shoot":
        this.tone(880, 0.08, "square", 0.1, -500);
        break;
      case "bolt":
        this.tone(520, 0.12, "sawtooth", 0.1, 260);
        break;
      case "hit":
        this.noise(0.06, 0.2, 1400);
        break;
      case "thud":
        this.tone(90, 0.16, "sine", 0.35, -40);
        this.noise(0.1, 0.22, 500);
        break;
      case "heal":
        this.tone(523, 0.14, "sine", 0.12);
        this.tone(659, 0.14, "sine", 0.12, 0, 0.07);
        this.tone(784, 0.2, "sine", 0.12, 0, 0.14);
        break;
      case "fireball":
        this.noise(0.28, 0.3, 900);
        this.tone(140, 0.28, "sawtooth", 0.16, -70);
        break;
      case "frost":
        this.tone(1200, 0.25, "sine", 0.09, -700);
        this.noise(0.2, 0.1, 5000);
        break;
      case "warcry":
        this.tone(180, 0.3, "sawtooth", 0.2, 90);
        break;
      case "shield":
        this.tone(330, 0.2, "triangle", 0.16, 160);
        break;
      case "ready":
        this.tone(880, 0.1, "sine", 0.08);
        this.tone(1320, 0.14, "sine", 0.07, 0, 0.07);
        break;
      case "coin":
        this.tone(1180, 0.07, "square", 0.12, 60);
        this.tone(1560, 0.09, "square", 0.1, 40, 0.07);
        break;
      case "roar":
        this.tone(90, 0.5, "sawtooth", 0.3, 60);
        this.noise(0.45, 0.25, 700);
        this.tone(140, 0.4, "sawtooth", 0.18, -50, 0.1);
        break;
      case "levelup":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.14, 0, i * 0.09));
        break;
      case "victory":
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.14, 0, i * 0.13));
        break;
      case "defeat":
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, "sine", 0.16, 0, i * 0.18));
        break;
      case "wave":
        this.tone(196, 0.25, "triangle", 0.14, 100);
        this.tone(294, 0.25, "triangle", 0.12, 0, 0.12);
        break;
    }
  }

  private startMusic(): void {
    if (this.musicTimer !== null) return;
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;
    // Synth fallback bed: a slow campfire arpeggio on menus, a driving pulse
    // in battle. Retires itself the moment a real track finishes loading.
    const chords = [
      [220, 261.6, 329.6, 392],
      [196, 246.9, 293.7, 392],
      [174.6, 220, 261.6, 349.2],
      [196, 246.9, 293.7, 370],
    ];
    const lead = [440, 523.2, 587.3, 659.2, 784, 659.2, 587.3, 523.2];
    const stepDur = 0.4;
    const tick = () => {
      if (!this.musicOn || !this.soundOnContextAlive() || this.trackNode) return;
      const chord = chords[Math.floor(this.musicStep / 8) % chords.length];
      const g = this.musicGain!;
      if (this.mood === "menu") {
        const note = chord[this.musicStep % chord.length];
        const octave = this.musicStep % 8 >= 4 ? 2 : 1;
        this.tone(note * octave, 0.9, "sine", 0.5, 0, 0, g);
        if (this.musicStep % 8 === 0) this.tone(chord[0] / 2, 3.2, "triangle", 0.35, 0, 0, g);
        if (this.musicStep % 4 === 0) this.tone(58, 0.14, "sine", 0.4, -12, 0, g);
        if (this.musicStep % 16 === 10) this.tone(chord[2] * 4, 1.6, "sine", 0.13, 0, 0.2, g);
      } else {
        if (this.musicStep % 2 === 0) this.tone(chord[0] / 2, 0.32, "triangle", 0.5, 0, 0, g);
        this.tone(58, 0.1, "sine", this.musicStep % 4 === 0 ? 0.6 : 0.3, -14, 0, g);
        this.tone(chord[(this.musicStep % 3) + 1] ?? chord[1], 0.22, "square", 0.08, 0, 0, g);
        if (this.musicStep % 2 === 1) {
          const n = lead[Math.floor(this.musicStep / 2) % lead.length];
          this.tone(n, 0.5, "sine", 0.22, 0, 0, g);
        }
      }
      this.musicStep++;
    };
    this.musicTimer = window.setInterval(tick, stepDur * 1000);
  }

  private soundOnContextAlive(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    if (!on) {
      this.stopAmbience();
      this.ambienceKind = null;
    } else {
      // re-arm the current place's ambience
      const kind = this.mood === "menu" ? ("menu" as const) : this.stageId;
      this.ambienceKind = null;
      this.setAmbience(kind);
    }
  }

  private marchTimer: number | null = null;
  private marchStep = 0;

  /** Soft footfalls while the band marches between fights. */
  setMarching(on: boolean): void {
    if (on && this.marchTimer === null && this.soundOn) {
      const LILT = [392, 440, 523, 440, 587, 523];
      this.marchTimer = window.setInterval(() => {
        if (!this.soundOnContextAlive()) return;
        this.noise(0.05, 0.05, this.marchStep % 2 ? 500 : 380);
        if (this.musicOn && this.musicGain && this.marchStep % 2 === 0) {
          this.tone(LILT[(this.marchStep / 2) % LILT.length], 0.34, "sine", 0.5, 0, 0, this.musicGain);
        }
        this.marchStep++;
      }, 300);
    } else if (!on && this.marchTimer !== null) {
      clearInterval(this.marchTimer);
      this.marchTimer = null;
    }
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on) {
      this.syncMusic();
      if (!this.trackNode) this.startMusic();
    } else {
      this.stopTrack(0.25);
    }
  }

  /** 0-1 loudness for effects + ambience (independent of the on/off toggle). */
  setSoundVolume(v: number): void {
    this.sfxLevel = Math.max(0, Math.min(1, v));
    if (this.sfxOut) this.sfxOut.gain.value = this.sfxLevel;
  }

  /** 0-1 loudness for music. */
  setMusicVolume(v: number): void {
    this.musicLevel = Math.max(0, Math.min(1, v));
    if (this.musicVolNode) this.musicVolNode.gain.value = this.musicLevel;
  }
}

export const audio = new AudioKit();
