/**
 * Tiny synthesized sound kit — no audio assets, everything is generated
 * with WebAudio oscillators and filtered noise.
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
  | "roar"
  | "levelup"
  | "victory"
  | "defeat"
  | "wave";

class AudioKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  soundOn = true;
  musicOn = true;

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
    this.startMusic();
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

  play(name: SfxName): void {
    if (!this.soundOn) return;
    switch (name) {
      case "click":
        this.tone(660, 0.06, "square", 0.12, 120);
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
    // A slow modal arpeggio over two alternating chords — quiet campfire fantasy.
    const chords = [
      [220, 261.6, 329.6, 392],
      [196, 246.9, 293.7, 392],
      [174.6, 220, 261.6, 349.2],
      [196, 246.9, 293.7, 370],
    ];
    const stepDur = 0.42;
    const tick = () => {
      if (!this.musicOn || !this.soundOnContextAlive()) return;
      const chord = chords[Math.floor(this.musicStep / 8) % chords.length];
      const note = chord[this.musicStep % chord.length];
      const octave = this.musicStep % 8 >= 4 ? 2 : 1;
      this.tone(note * octave, 0.9, "sine", 0.5, 0, 0, this.musicGain!);
      if (this.musicStep % 8 === 0) {
        this.tone(chord[0] / 2, 3.2, "triangle", 0.35, 0, 0, this.musicGain!);
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
    if (on) this.startMusic();
  }
}

export const audio = new AudioKit();
