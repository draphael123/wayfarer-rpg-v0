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
  | "ultBlink";

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

  setMood(mood: "menu" | "battle", stageId?: number): void {
    this.mood = mood;
    if (stageId !== undefined) this.stageId = stageId;
    if (mood === "menu") this.bossActive = false;
    this.syncMusic();
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
    return `music-stage${Math.max(0, Math.min(5, this.stageId))}`;
  }

  private ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call from the first user gesture so the context is allowed to start. */
  unlock(): void {
    this.ensure();
    this.loadSamples();
    this.syncMusic();
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
    gain.connect(this.master);
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
    gain.connect(this.master);
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
    gain.connect(dest ?? this.master);
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
    gain.connect(this.master);
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
}

export const audio = new AudioKit();
