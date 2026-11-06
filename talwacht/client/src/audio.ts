/** Sound: Kenney CC0 samples for impacts and coins, WebAudio synthesis for the rest, plus a soft generative music loop. */
const FILES: Record<string, string[]> = {
  slash: ['impactMetal_light_000', 'impactMetal_light_001', 'impactMetal_light_002'],
  spear: ['impactMetal_medium_000', 'impactMetal_medium_001'],
  charge: ['impactPlate_heavy_000', 'impactPlate_heavy_001'],
  siege: ['impactWood_heavy_000', 'impactWood_heavy_001'],
  death: ['impactSoft_heavy_000', 'impactSoft_heavy_001', 'impactSoft_medium_000'],
  punch: ['impactPunch_medium_000'],
  bell: ['impactBell_heavy_000'],
  coins: ['handleCoins', 'handleCoins2'],
  click: ['metalClick'],
  draw: ['drawKnife1', 'clothBelt'],
};

type Sfx = keyof typeof FILES | 'arrow' | 'bolt' | 'magic' | 'heal' | 'rally' | 'horn' | 'win' | 'lose' | 'level';

class AudioSys {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private musicBus?: GainNode;
  private bufs = new Map<string, AudioBuffer[]>();
  private recent: number[] = [];
  muted = (() => { try { return localStorage.getItem('bw-mute') === '1'; } catch { return false; } })();
  private musicTimer = 0;
  private beat = 0;

  /** must run from a user gesture; safe to call repeatedly */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.22; this.musicBus.connect(this.master);
      void this.load();
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('bw-mute', this.muted ? '1' : '0'); } catch { /* private mode */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    return this.muted;
  }

  private async load() {
    const ctx = this.ctx!;
    await Promise.all(Object.entries(FILES).map(async ([k, names]) => {
      const out: AudioBuffer[] = [];
      for (const n of names) {
        try {
          const r = await fetch(`${import.meta.env.BASE_URL}assets/sfx/${n}.ogg`);
          if (r.ok) out.push(await ctx.decodeAudioData(await r.arrayBuffer()));
        } catch { /* a missing sample just stays silent */ }
      }
      this.bufs.set(k, out);
    }));
  }

  /** vol 0..1 (distance already applied by the caller) */
  play(name: Sfx, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted || ctx.state !== 'running' || vol < 0.02) return;
    const now = ctx.currentTime;
    // a big battle fires hundreds of events a second; keep the mix readable
    this.recent = this.recent.filter(t => now - t < 0.1);
    if (this.recent.length >= 10) return;
    this.recent.push(now);
    const list = this.bufs.get(name);
    if (list?.length) {
      const src = ctx.createBufferSource(); src.buffer = list[(Math.random() * list.length) | 0];
      src.playbackRate.value = 0.9 + Math.random() * 0.25;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(g).connect(this.sfxBus); src.start(now);
      return;
    }
    this.synth(name, vol, now);
  }

  private env(g: GainNode, t: number, a: number, d: number, peak: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(freq: number, t: number, dur: number, vol: number, type: OscillatorType = 'sine', bus: GainNode = this.sfxBus!, slide = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    this.env(g, t, Math.min(0.02, dur / 3), dur, vol);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, vol: number, f0: number, f1: number) {
    const ctx = this.ctx!;
    const n = Math.max(1, (ctx.sampleRate * dur) | 0), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); this.env(g, t, dur * 0.2, dur * 0.8, vol);
    s.connect(f).connect(g).connect(this.sfxBus!); s.start(t);
  }

  private synth(name: Sfx, vol: number, t: number) {
    switch (name) {
      case 'arrow': this.noise(t, 0.18, 0.35 * vol, 2400, 900); break;
      case 'bolt': this.noise(t, 0.12, 0.45 * vol, 3200, 1200); this.tone(180, t, 0.08, 0.25 * vol, 'triangle', this.sfxBus!, 0.5); break;
      case 'magic': this.tone(660, t, 0.5, 0.18 * vol, 'sine', this.sfxBus!, 1.5); this.tone(990, t + 0.05, 0.5, 0.12 * vol); break;
      case 'heal': this.tone(880, t, 0.35, 0.12 * vol); this.tone(1320, t + 0.08, 0.35, 0.08 * vol); break;
      case 'rally': [392, 494, 587].forEach((f, i) => this.tone(f, t + i * 0.09, 0.6, 0.16 * vol, 'triangle')); break;
      case 'level': [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.07, 0.4, 0.14 * vol, 'triangle')); break;
      case 'horn': this.tone(165, t, 1.1, 0.3 * vol, 'sawtooth'); this.tone(247, t + 0.35, 1.0, 0.25 * vol, 'sawtooth'); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.16, 0.9, 0.22 * vol, 'triangle')); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(f, t + i * 0.28, 1.1, 0.22 * vol, 'sine')); break;
      default: break;
    }
  }

  /** gentle pentatonic pad + plucks; random but always consonant */
  private startMusic() {
    const ctx = this.ctx!;
    const CHORDS = [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]]; // C, Am, G, F-ish in semitones from C3
    const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
    const hz = (s: number) => 130.81 * 2 ** (s / 12);
    const step = () => {
      if (!this.musicBus || ctx.state !== 'running' || this.muted) return;
      const t = ctx.currentTime + 0.05, bar = (this.beat >> 3) % CHORDS.length, chord = CHORDS[bar];
      if (this.beat % 8 === 0) for (const n of chord) this.tone(hz(n), t, 4.2, 0.13, 'sine', this.musicBus);
      if (Math.random() < 0.55) this.tone(hz(chord[0] + 12 + SCALE[(Math.random() * SCALE.length) | 0]), t, 1.4, 0.08, 'triangle', this.musicBus);
      this.beat++;
    };
    this.musicTimer = window.setInterval(step, 600);
  }
}

export const audio = new AudioSys();
export type { Sfx };
