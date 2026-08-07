/**
 * Hybrid audio kit: real CC0 recordings (per-stage music, foley SFX) loaded
 * lazily as MP3, with the original synthesized WebAudio kit as an instant
 * fallback while samples stream in (or if they fail to load).
 *
 * Music: medieval-fantasy & rpg-battle-system packs (Superpowers, CC0), plus
 * TAD's "Once Upon a Time" title loop (CC0; see audio/LICENSES.md).
 * SFX: ninja-adventure & medieval-fantasy packs (Superpowers, CC0).
 */
import type { DamageElement } from "./types";

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
  | "armorSurge"
  | "armorTumble"
  | "armorRally"
  | "armorBrace"
  | "anvil"
  | "setChime"
  | "hiss"
  | "screech"
  | "wingbeat"
  | "drumbeat"
  | "breach"
  | "howl"
  | "warhorn"
  | "flawless"
  | "clink"
  | "page"
  | "tankard"
  | "staggerBreak"
  | "glacialGroan"
  | "wispShatter"
  | "hagChant"
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
  | "spBastion"
  | "bossEruption"
  | "bossRoots"
  | "bossEclipse"
  | "bossBeam"
  | "bossShatter"
  | "bossBloodmoon"
  | "bossVoid";

/** SFX that have recorded versions; each entry lists variants to pick from. */
// Only the two big produced stingers keep their recordings — everything else
// speaks in the synth voice so combat sounds like ONE instrument, warm and full,
// instead of a drawer of clicky samples.
const SAMPLE_SFX: Partial<Record<SfxName, string[]>> = {
  victory: ["sfx-victory"],
  defeat: ["sfx-defeat"],
};

// Recorded scene music is loaded lazily; the synth bed begins immediately and
// then yields through a short crossfade when the requested track is ready.
const MUSIC_TRACKS = [
  "music-menu",
  "music-stage0",
  "music-stage1",
  "music-stage2",
  "music-stage3",
  "music-stage4",
  "music-stage5",
  "music-boss",
  "music-coast",
  "music-miniboss",
  "music-mainboss",
];

const SAMPLE_FILES: Partial<Record<string, string>> = {
  "music-menu": "audio/music-menu-new.mp3",
  "music-coast": "audio/music-coast.ogg",
};

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
  private sampleRequests = new Set<string>();
  private noiseBuffer: AudioBuffer | null = null;
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
    const regionBeds: Array<{ freq: number; gain: number }> = [
      { freq: 760, gain: 0.018 }, // South Road: open wind
      { freq: 430, gain: 0.026 }, // Winterreach: snow hush
      { freq: 1200, gain: 0.034 }, // Storm Coast: surf and rain
      { freq: 360, gain: 0.032 }, // Cinderwake: ash and furnace breath
      { freq: 1700, gain: 0.022 }, // Verdant Wilds: leaves and insects
      { freq: 520, gain: 0.026 }, // Gloamfen: low, close fog
      { freq: 980, gain: 0.02 }, // Sunken Reliquary: resonant stone
      { freq: 2600, gain: 0.028 }, // Shatterpeak: high wind
      { freq: 650, gain: 0.025 }, // Bloodmoon Weald: uneasy woodland
      { freq: 220, gain: 0.028 }, // World's End: subsonic void wash
    ];
    const region = typeof kind === "number" ? Math.floor(kind / 6) : -1;
    const spec = bedSpec[String(kind)] ?? regionBeds[region];
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
    const region = Math.floor(kind / 6);
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
    } else if (region === 1) {
      // Winterreach: ice settling and a bell carried over the snow.
      if (roll < 0.28) {
        this.tone(1180, 0.5, "sine", 0.04, -160);
        this.tone(590, 0.8, "sine", 0.025, -40, 0.08);
      }
    } else if (region === 2) {
      // Storm Coast: breakers, rigging, and distant thunder.
      if (roll < 0.42) this.noise(0.55, 0.07, 700 + Math.random() * 500);
      else if (roll < 0.5) this.tone(62, 0.8, "sine", 0.055, -12);
    } else if (region === 3) {
      // Cinderwake: ember spits over a furnace pulse.
      if (roll < 0.5) {
        this.noise(0.05, 0.1, 1100 + Math.random() * 1300);
        this.tone(55, 0.45, "sine", 0.045, -8, 0.06);
      }
    } else if (region === 4) {
      // Verdant Wilds: layered insect calls and bright canopy birds.
      if (roll < 0.38) {
        const note = 1650 + Math.random() * 900;
        this.tone(note, 0.06, "sine", 0.035, 300);
        this.tone(note * 0.82, 0.08, "sine", 0.03, -180, 0.13);
      }
    } else if (region === 5) {
      // Gloamfen: small sounds that never quite reveal their source.
      if (roll < 0.3) {
        this.noise(0.22, 0.045, 2600, Math.random() * 0.3);
        this.tone(185, 0.55, "sine", 0.035, -70, 0.12);
      }
    } else if (region === 6) {
      // Sunken Reliquary: water drops wake old bronze and stone.
      if (roll < 0.34) {
        this.tone(1040, 0.07, "sine", 0.045, -420);
        this.tone(260, 1.1, "sine", 0.028, 0, 0.08);
      }
    } else if (region === 7) {
      // Shatterpeak: crystal chimes in thin, violent wind.
      if (roll < 0.4) {
        this.noise(0.35, 0.045, 3200);
        this.tone(1760 + Math.random() * 500, 0.7, "triangle", 0.035, -90, 0.1);
      }
    } else if (region === 8) {
      // Bloodmoon Weald: a heartbeat under the hunt.
      if (roll < 0.32) {
        this.tone(62, 0.16, "sine", 0.075, -9);
        this.tone(58, 0.2, "sine", 0.055, -8, 0.22);
      }
    } else if (region === 9) {
      // World's End: a reversed-feeling harmonic and a distant road groan.
      if (roll < 0.3) {
        this.tone(96, 1.2, "sawtooth", 0.035, 90);
        this.tone(740, 0.8, "sine", 0.025, -420, 0.18);
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
    if (this.bossActive) {
      if (this.stageId >= 18) return `music-boss-region${Math.floor(this.stageId / 6)}`;
      return [5, 11, 17].includes(this.stageId) ? "music-mainboss" : "music-miniboss";
    }
    if (this.stageId >= 18) return `music-region${Math.floor(this.stageId / 6)}`;
    if (this.stageId >= 12) return "music-coast";
    if (this.stageId >= 6) return "music-winter"; // no sample bears this name: the synth winter theme owns Act 2
    return `music-stage${Math.max(0, Math.min(5, this.stageId))}`;
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
      // every effect passes a gentle high-shelf cut — the whole kit warms up,
      // and nothing clicks or hisses at the top end
      const shelf = this.ctx.createBiquadFilter();
      shelf.type = "highshelf";
      shelf.frequency.value = 5200;
      shelf.gain.value = -7;
      this.sfxOut.connect(shelf);
      shelf.connect(this.master);
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
    this.syncMusic();
    this.setAmbience(this.mood === "menu" ? "menu" : this.stageId);
    if (!this.trackNode) this.startMusic();
  }

  /** Fetch and decode only the recording the current scene actually needs.
   *  The synth remains the immediate fallback while it arrives. */
  private loadSample(name: string): void {
    if (this.samples.has(name) || this.sampleRequests.has(name)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const overrides = (window as unknown as { __WAYBAND_AUDIO?: Record<string, string> }).__WAYBAND_AUDIO ?? {};
    if (!ALL_SAMPLES.includes(name) && !overrides[name]) return;
    this.sampleRequests.add(name);
    const url = overrides[name] ?? SAMPLE_FILES[name] ?? `audio/${name}.mp3`;
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
    if (!buffer) {
      this.loadSample(want);
      // Nothing recorded bears this name (notably the Winterreach), so hand
      // the music back to the live synth bed.
      this.stopTrack(0.7);
      this.startMusic();
      return;
    }
    // a recording owns this scene — quiet the synth while it plays
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
    // The orchestral title loop is deliberately a touch broader than the
    // combat beds; the user's music-volume setting still controls both.
    const level = want === "music-menu" ? 0.38 : 0.32;
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
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      const len = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const buffer = this.noiseBuffer;
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
    const playDuration = Math.min(dur, buffer.duration);
    const offset = Math.random() * Math.max(0, buffer.duration - playDuration);
    src.start(t0, offset, playDuration);
  }

  /** Kill-streak chime: each quick kill climbs — kept low and woody now. */
  killChime(streak: number): void {
    if (!this.soundOn) return;
    const freq = 392 * Math.pow(1.1225, Math.min(streak - 1, 8));
    this.tone(freq, 0.12, "triangle", 0.09, 20);
    this.tone(freq / 2, 0.1, "sine", 0.07);
    if (streak >= 3) this.tone(freq * 1.5, 0.1, "sine", 0.05, 0, 0.06);
  }

  /** One authored contact sound replaces stacked generic hit/thud calls. The
   *  edge arrives first, the body follows, and lethal blows land on the floor
   *  a breath later. Amount controls weight without changing gameplay. */
  impact(amount: number, lethal = false, spell = false): void {
    if (!this.soundOn) return;
    const weight = Math.max(0, Math.min(1, (amount - 6) / 34));
    if (spell) {
      this.noise(0.07 + weight * 0.05, 0.08 + weight * 0.08, 1700 + weight * 1700);
      this.tone(230 + weight * 150, 0.09 + weight * 0.05, "triangle", 0.08 + weight * 0.08, -80);
    } else {
      this.noise(0.06 + weight * 0.07, 0.1 + weight * 0.1, 1150 - weight * 500);
      this.tone(125 - weight * 52, 0.08 + weight * 0.09, "sine", 0.12 + weight * 0.14, -18);
    }
    if (weight > 0.5) this.tone(72, 0.13, "sine", 0.12 * weight, -18, 0.015);
    if (lethal) {
      this.noise(0.13, 0.16 + weight * 0.08, 430, 0.08);
      this.tone(76 - weight * 18, 0.22, "sine", 0.25 + weight * 0.12, -28, 0.075);
    }
  }

  /** A compact road cue bridges menus and battle without interrupting music. */
  travel(direction: "depart" | "return"): void {
    if (!this.soundOn) return;
    if (direction === "depart") {
      this.noise(0.12, 0.07, 850);
      this.tone(147, 0.28, "triangle", 0.13, 34);
      this.tone(220, 0.34, "triangle", 0.1, 18, 0.11);
    } else {
      this.noise(0.09, 0.055, 1200);
      this.tone(220, 0.26, "triangle", 0.1, -18);
      this.tone(294, 0.3, "sine", 0.09, 0, 0.1);
    }
  }

  /** Elemental reactions share a cadence but retain a distinct material voice. */
  elementCast(element: Exclude<DamageElement, "physical">, intent: "core" | "focus" | "ultimate"): void {
    if (!this.soundOn) return;
    const weight = intent === "ultimate" ? 1 : intent === "focus" ? 0.72 : 0.48;
    switch (element) {
      case "flame":
        this.noise(0.12 + weight * 0.16, 0.07 + weight * 0.08, 1900 + weight * 900);
        this.tone(190, 0.16 + weight * 0.18, "sawtooth", 0.08 + weight * 0.09, 230);
        break;
      case "frost":
        this.tone(1120, 0.2 + weight * 0.14, "triangle", 0.07 + weight * 0.08, -520);
        this.tone(1760, 0.11, "sine", 0.06 + weight * 0.05, -180, 0.04);
        this.noise(0.08, 0.04 + weight * 0.04, 4300, 0.025);
        break;
      case "storm":
        this.noise(0.045, 0.15 + weight * 0.12, 5200);
        this.tone(720, 0.07, "square", 0.09 + weight * 0.1, -360);
        this.tone(1080, 0.09, "square", 0.05 + weight * 0.06, -540, 0.055);
        break;
      case "earth":
        this.tone(68, 0.22 + weight * 0.22, "sine", 0.16 + weight * 0.18, -16);
        this.noise(0.13 + weight * 0.12, 0.12 + weight * 0.12, 620);
        break;
      case "venom":
        this.noise(0.2 + weight * 0.16, 0.07 + weight * 0.06, 3600);
        this.tone(310, 0.2 + weight * 0.16, "triangle", 0.06 + weight * 0.07, -125);
        break;
      case "radiant":
        this.tone(523, 0.28 + weight * 0.2, "sine", 0.06 + weight * 0.07, 12);
        this.tone(659, 0.28 + weight * 0.2, "sine", 0.05 + weight * 0.06, 10, 0.035);
        this.tone(784, 0.32 + weight * 0.2, "triangle", 0.05 + weight * 0.06, 8, 0.07);
        break;
      case "blood":
        this.tone(82, 0.11, "sine", 0.18 + weight * 0.13, -8);
        this.tone(82, 0.13, "sine", 0.14 + weight * 0.11, -7, 0.16);
        this.tone(196, 0.24 + weight * 0.16, "sawtooth", 0.05 + weight * 0.06, 35, 0.04);
        break;
      case "shadow":
        this.tone(248, 0.26 + weight * 0.2, "sine", 0.05 + weight * 0.07, -132);
        this.tone(124, 0.34 + weight * 0.2, "triangle", 0.06 + weight * 0.06, 70, 0.05);
        this.noise(0.18, 0.03 + weight * 0.04, 900, 0.02);
        break;
    }
  }

  reaction(element: DamageElement): void {
    if (!this.soundOn || element === "physical") return;
    const roots: Record<Exclude<DamageElement, "physical">, number> = {
      flame: 330, frost: 523, storm: 659, earth: 147,
      venom: 277, radiant: 784, blood: 220, shadow: 196,
    };
    const root = roots[element];
    const wave: OscillatorType = element === "storm" ? "square" : element === "earth" || element === "blood" ? "sawtooth" : "triangle";
    this.tone(root, 0.18, wave, 0.14, element === "frost" ? -90 : 60);
    this.tone(root * 1.5, 0.24, "sine", 0.11, -35, 0.055);
    this.noise(0.08, element === "earth" ? 0.12 : 0.07, element === "storm" ? 2600 : element === "frost" ? 1800 : 1100, 0.025);
  }

  play(name: SfxName): void {
    if (!this.soundOn) return;
    // prefer a recorded variant when it has arrived
    const variants = SAMPLE_SFX[name];
    if (variants) {
      const pick = variants[Math.floor(Math.random() * variants.length)];
      if (this.playSample(pick)) return;
      this.loadSample(pick);
    }
    switch (name) {
      case "click":
        this.tone(660, 0.06, "square", 0.12, 120);
        break;
      // ---- ultimate voices: each path's big moment sounds like itself
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
      case "glacialGroan":
        // a voice like a glacier turning in its sleep
        this.tone(65, 1.6, "sawtooth", 0.18, 8);
        this.tone(98, 1.4, "sawtooth", 0.12, 6, 0.1);
        this.noise(1.2, 0.06, 240, 0.2);
        this.tone(49, 1.2, "sine", 0.16, -6, 0.5);
        break;
      case "wispShatter":
        // winter glass breaking into light
        this.noise(0.12, 0.1, 4200);
        for (let i = 0; i < 4; i++) this.tone(1400 + i * 380, 0.12, "triangle", 0.07, -200, i * 0.03);
        break;
      case "hagChant":
        // three cold notes, sung low
        this.tone(233, 0.3, "sine", 0.1, 8);
        this.tone(196, 0.3, "sine", 0.1, 6, 0.24);
        this.tone(261, 0.44, "sine", 0.11, -10, 0.48);
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
      // ---- new foes announce themselves
      case "hiss":
        // the stalker marks its prey from the reeds
        this.noise(0.3, 0.12, 5200);
        this.noise(0.2, 0.08, 3600, 0.12);
        this.tone(180, 0.14, "sawtooth", 0.05, -40, 0.05);
        break;
      case "screech":
        // a harrier folding its wings to fall
        this.tone(1450, 0.32, "sawtooth", 0.1, -520);
        this.tone(1900, 0.2, "square", 0.05, -700, 0.03);
        this.noise(0.16, 0.06, 4200, 0.06);
        break;
      case "wingbeat":
        // heavy air taken twice
        this.noise(0.12, 0.16, 700);
        this.noise(0.12, 0.14, 620, 0.16);
        break;
      case "breach":
        // the lake explodes: deep water, shattering glass, a serpent's cry
        this.tone(60, 0.6, "sine", 0.3, -14);
        this.noise(0.4, 0.24, 800);
        for (let i = 0; i < 5; i++) this.tone(1200 + i * 340, 0.14, "triangle", 0.06, -240, 0.08 + i * 0.03);
        this.tone(340, 0.7, "sawtooth", 0.12, 220, 0.12);
        break;
      case "drumbeat":
        // three strikes of the hide drum: DOOM-doom-doom
        this.tone(72, 0.22, "sine", 0.26, -10);
        this.noise(0.06, 0.1, 500);
        this.tone(72, 0.16, "sine", 0.18, -8, 0.2);
        this.tone(72, 0.16, "sine", 0.18, -8, 0.36);
        break;
      // ---- armor skills: each family speaks in its own voice
      case "armorSurge":
        // cloth: time itself hurried along — a rising arcane spin
        for (let i = 0; i < 4; i++) this.tone(620 + i * 210, 0.09, "triangle", 0.09, 240, i * 0.05);
        this.tone(1660, 0.3, "sine", 0.08, -180, 0.2);
        this.noise(0.12, 0.05, 4600, 0.02);
        break;
      case "armorTumble":
        // leather: a roll through the dust and away
        this.noise(0.14, 0.2, 1400);
        this.noise(0.1, 0.16, 2600, 0.08);
        this.tone(300, 0.12, "sine", 0.1, 260, 0.1);
        break;
      case "armorRally":
        // mail: a steadying shout with steel under it
        this.tone(196, 0.24, "sawtooth", 0.12, 14);
        this.tone(294, 0.3, "triangle", 0.12, 8, 0.08);
        this.tone(392, 0.4, "sine", 0.1, 0, 0.16);
        this.noise(0.1, 0.04, 800, 0.02);
        break;
      case "armorBrace":
        // plate: feet planted like a dropped portcullis
        this.tone(75, 0.3, "sine", 0.26, -16);
        this.noise(0.16, 0.2, 600);
        this.tone(440, 0.08, "square", 0.08, -120, 0.03);
        this.tone(110, 0.4, "sine", 0.14, -8, 0.1);
        break;
      case "anvil":
        // the forge answers: hammer, ring, and settling sparks
        this.tone(520, 0.06, "square", 0.16, -80);
        this.noise(0.08, 0.18, 3400);
        this.tone(1240, 0.5, "triangle", 0.1, -40, 0.05);
        this.noise(0.3, 0.05, 5200, 0.1);
        break;
      case "setChime":
        // three pieces of one family lock into place
        this.tone(392, 0.14, "triangle", 0.14);
        this.tone(523, 0.14, "triangle", 0.14, 0, 0.11);
        this.tone(659, 0.18, "triangle", 0.13, 0, 0.22);
        this.tone(784, 0.55, "sine", 0.12, 0, 0.33);
        this.noise(0.1, 0.03, 5000, 0.33);
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
      // ---- late-road bosses: seven silhouettes, seven unmistakable calls
      case "bossEruption":
        this.tone(54, 0.9, "sawtooth", 0.22, 32);
        this.noise(0.55, 0.22, 520, 0.08);
        for (let i = 0; i < 4; i++) this.noise(0.06, 0.1, 1300 + i * 260, 0.18 + i * 0.06);
        break;
      case "bossRoots":
        this.noise(0.65, 0.16, 440);
        this.tone(82, 0.8, "triangle", 0.16, 38);
        this.tone(123, 0.55, "sine", 0.1, -18, 0.14);
        break;
      case "bossEclipse":
        this.noise(0.5, 0.1, 2800);
        this.tone(740, 0.75, "sine", 0.09, -590);
        this.tone(92, 0.9, "sawtooth", 0.11, -28, 0.08);
        break;
      case "bossBeam":
        this.tone(392, 0.55, "triangle", 0.12, 520);
        this.tone(784, 0.5, "sine", 0.1, 0, 0.06);
        this.noise(0.3, 0.12, 3600, 0.22);
        break;
      case "bossShatter":
        for (let i = 0; i < 6; i++) this.tone(2100 - i * 210, 0.11, "triangle", 0.065, -420, i * 0.035);
        this.noise(0.28, 0.19, 3900, 0.08);
        this.tone(70, 0.45, "sine", 0.15, -20, 0.16);
        break;
      case "bossBloodmoon":
        this.tone(64, 0.18, "sine", 0.18, -8);
        this.tone(58, 0.23, "sine", 0.15, -7, 0.2);
        this.tone(196, 0.65, "sawtooth", 0.1, 100, 0.28);
        break;
      case "bossVoid":
        this.tone(48, 1.2, "sawtooth", 0.18, 70);
        this.tone(71, 1.1, "sine", 0.13, -29, 0.02);
        this.noise(0.8, 0.12, 260, 0.12);
        this.tone(1170, 0.85, "sine", 0.06, -980, 0.24);
        break;
      case "slash":
        // steel with WEIGHT: air, edge, and a body thump under it
        this.noise(0.11, 0.2, 1900);
        this.tone(320, 0.07, "triangle", 0.12, -140);
        this.tone(130, 0.09, "sine", 0.16, -30, 0.01);
        break;
      case "shoot":
        // a real bow: string snap, then the shaft cutting air
        this.tone(420, 0.05, "triangle", 0.14, -180);
        this.noise(0.12, 0.12, 1600, 0.02);
        this.tone(240, 0.08, "sine", 0.08, -60, 0.02);
        break;
      case "bolt":
        // arcane with a low core, not a zap
        this.tone(360, 0.14, "triangle", 0.12, 180);
        this.tone(150, 0.12, "sine", 0.1, 40);
        this.noise(0.08, 0.06, 2400, 0.02);
        break;
      case "hit":
        // flesh and padding, not a click
        this.noise(0.08, 0.16, 900);
        this.tone(110, 0.07, "sine", 0.14, -25);
        break;
      case "thud":
        this.tone(80, 0.2, "sine", 0.38, -35);
        this.noise(0.12, 0.2, 420);
        this.tone(160, 0.06, "triangle", 0.1, -60);
        break;
      case "heal":
        // a warm breath, not a doorbell
        this.tone(392, 0.28, "sine", 0.11, 30);
        this.tone(523, 0.3, "sine", 0.1, 20, 0.09);
        this.noise(0.2, 0.03, 2600, 0.02);
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
        // a soft wooden knock and a low hum — present, not shrill
        this.tone(587, 0.09, "triangle", 0.07);
        this.tone(880, 0.12, "sine", 0.05, 0, 0.06);
        break;
      case "coin":
        // coin into a leather purse, not an arcade machine
        this.tone(940, 0.06, "triangle", 0.1, 40);
        this.tone(1180, 0.08, "sine", 0.07, 30, 0.05);
        this.noise(0.04, 0.04, 3000, 0.01);
        break;
      case "roar":
        // a chest you can feel: two throats, breath, and a dying growl
        this.tone(72, 0.7, "sawtooth", 0.26, 40);
        this.tone(109, 0.65, "sawtooth", 0.16, 30, 0.03);
        this.noise(0.55, 0.2, 480);
        this.tone(96, 0.5, "sawtooth", 0.14, -45, 0.22);
        this.noise(0.3, 0.08, 260, 0.35);
        break;
      case "levelup":
        // rising warmth with a body under it — earned, not electronic
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.12, 0, i * 0.09));
        this.tone(196, 0.7, "sine", 0.12, 0, 0);
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
        // CAMPFIRE FOLK: plucked strings around the fire — a band at rest.
        // Am — F — C — G, fingerpicked with a wandering thumb, warm and unhurried.
        const folk = [
          [110, 220, 261.6, 329.6], // Am: bass, then broken chord
          [87.3, 174.6, 220, 261.6], // F
          [130.8, 196, 261.6, 329.6], // C
          [98, 196, 246.9, 293.7], // G
        ];
        const bar = folk[Math.floor(this.musicStep / 8) % folk.length];
        const s8 = this.musicStep % 8;
        // the pluck: fast-decay triangle doubled with a whisper-detuned partner
        const pluck = (f: number, vol: number, delay = 0) => {
          this.tone(f, 0.55, "triangle", vol, 0, delay, g);
          this.tone(f * 1.004, 0.45, "sine", vol * 0.45, 0, delay + 0.008, g);
        };
        // thumb bass on the strong beats, fingers answering between
        if (s8 === 0) {
          pluck(bar[0], 0.5);
          this.tone(bar[0] / 2, 3.4, "sine", 0.2, 0, 0, g); // fire-warm drone underneath
        } else if (s8 === 2 || s8 === 5) pluck(bar[1], 0.34);
        else if (s8 === 3 || s8 === 6) pluck(bar[2], 0.38);
        else if (s8 === 4) pluck(bar[3], 0.4);
        else if (s8 === 7 && this.musicStep % 16 === 15) pluck(bar[3] * 2, 0.26, 0.12); // a grace note before the turn
        // now and then a harmonic rings out over the fire
        if (this.musicStep % 32 === 20) this.tone(bar[2] * 4, 2.2, "sine", 0.09, 0, 0.15, g);
      } else if (this.mood === "battle" && this.stageId >= 18) {
        // Every six-stage late-road region has its own scale, pulse and timbre.
        // Bosses keep the regional motif but force it into a denser, lower register,
        // so the encounter feels climactic without sounding detached from its place.
        const lateThemes = [
          { root: 55, scale: [110, 130.8, 146.8, 164.8, 196], wave: "sawtooth" as OscillatorType }, // Cinderwake
          { root: 73.4, scale: [146.8, 174.6, 220, 246.9, 293.7], wave: "triangle" as OscillatorType }, // Verdant
          { root: 41.2, scale: [82.4, 98, 116.5, 138.6, 155.6], wave: "sine" as OscillatorType }, // Gloamfen
          { root: 65.4, scale: [130.8, 164.8, 196, 261.6, 329.6], wave: "triangle" as OscillatorType }, // Reliquary
          { root: 87.3, scale: [174.6, 220, 261.6, 329.6, 392], wave: "square" as OscillatorType }, // Shatterpeak
          { root: 55, scale: [110, 130.8, 155.6, 174.6, 207.7], wave: "sawtooth" as OscillatorType }, // Bloodmoon
          { root: 36.7, scale: [73.4, 87.3, 103.8, 123.5, 146.8], wave: "sine" as OscillatorType }, // World's End
        ];
        const theme = lateThemes[Math.min(lateThemes.length - 1, Math.max(0, Math.floor(this.stageId / 6) - 3))];
        const beat = this.musicStep % 8;
        const eliteActive = this.bossActive && this.stageId % 6 === 3;
        const finaleActive = this.bossActive && this.stageId % 6 === 5;
        const note = theme.scale[(this.musicStep * 3 + Math.floor(this.musicStep / 8)) % theme.scale.length];
        if (beat === 0 || (this.bossActive && beat === 4)) {
          this.tone(theme.root, this.bossActive ? 1.7 : 2.8, "sine", this.bossActive ? 0.42 : 0.28, -4, 0, g);
          this.tone(theme.root * 1.5, 1.5, "triangle", 0.1, 0, 0.03, g);
        }
        if (this.bossActive || beat % 2 === 1) {
          this.tone(note * (eliteActive ? 1.5 : this.bossActive ? 1 : 2), this.bossActive ? 0.38 : 0.7, theme.wave, this.bossActive ? 0.18 : 0.13, 0, 0, g);
        }
        // Elites drive the regional melody in a tense upper register. Final
        // bosses answer with a slower low brass-like pedal and a second pulse,
        // making the two encounter tiers immediately distinguishable.
        if (eliteActive && beat % 2 === 1) this.tone(note * 2.5, 0.24, "triangle", 0.08, -35, 0, g);
        if (finaleActive && beat === 6) {
          this.tone(theme.root * 0.5, 2.2, "sawtooth", 0.18, -3, 0, g);
          this.tone(theme.root * 2, 0.42, theme.wave, 0.1, 0, 0.08, g);
        }
        // Region-specific musical fingerprints layered over the shared road pulse.
        const lateRegion = Math.floor(this.stageId / 6);
        if (lateRegion === 3 && beat % 2 === 0) this.noise(0.08, 0.12, 620, 0.02); // forge hammer
        else if (lateRegion === 4 && beat === 3) this.tone(note * 3, 0.45, "sine", 0.08, 90, 0.08, g); // canopy answer
        else if (lateRegion === 5 && beat === 6) this.tone(note * 2.01, 1.1, "sine", 0.07, -note, 0, g); // falling shadow
        else if (lateRegion === 6 && beat % 4 === 2) this.tone(note * 4, 1.35, "triangle", 0.09, -60, 0, g); // bronze bell
        else if (lateRegion === 7 && beat % 2 === 0) this.noise(0.1, 0.08, 2800, 0.04); // mountain gust
        else if (lateRegion === 8 && (beat === 0 || beat === 1)) this.tone(58, 0.14, "sine", 0.2, -7, 0, g); // heartbeat
        else if (lateRegion === 9 && beat === 5) this.tone(note * 1.414, 1.2, "sine", 0.075, -note * 0.7, 0, g); // unstable interval
      } else if (this.mood === "battle" && this.stageId >= 6) {
        // the winter theme: sparse bells over a deep double-drone, a cold fifth
        // shadowing the melody, and — rarely — a horn from across the ice
        const scale = [220, 261.6, 293.7, 349.2, 392, 440];
        if (this.musicStep % 8 === 0) {
          this.tone(55, 3.6, "sine", 0.38, 0, 0, g);
          this.tone(82.4, 3.6, "sine", 0.18, 0, 0, g);
        }
        if (this.musicStep % 2 === 0) {
          const n = scale[Math.floor(Math.abs(Math.sin(this.musicStep * 1.7)) * scale.length) % scale.length];
          this.tone(n * 2, 1.2, "sine", 0.32, 0, 0, g);
          this.tone(n * 2 + 2, 1.2, "sine", 0.11, 0, 0, g);
          this.tone(n * 3, 1.0, "sine", 0.08, 0, 0.05, g); // the cold fifth above
        }
        if (this.musicStep % 16 === 12) this.tone(scale[2] * 4, 1.8, "sine", 0.1, 0, 0.2, g);
        if (this.musicStep % 64 === 40) this.tone(110, 2.6, "sawtooth", 0.06, 4, 0.1, g); // the far horn
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
      this.setMarching(false);
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
