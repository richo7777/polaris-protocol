// Polaris Protocol — all sound is synthesized with WebAudio. No audio files,
// no network: noise buffers, oscillators and filters only.
export class SFX {
  constructor() {
    this.ctx = null; this.master = null; this.noiseBuf = null; this.windSrc = null; this.muted = false;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startWind();
  }
  startWind() {
    if (!this.ctx || this.windSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.025;
    lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); this.windSrc = src;
  }
  _noise(dur, freq, q, vol, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  _tone(freq, dur, type, vol, slideTo = 0, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  shot(id, distant = false) {
    if (!this.ctx) return;
    const v = distant ? 0.12 : 0.5;
    switch (id) {
      case 'frostbite': this._noise(0.09, 2400, 0.8, v); this._tone(190, 0.07, 'square', v * 0.4, 90); break;
      case 'blizzard': this._noise(0.11, 1700, 0.7, v); this._tone(150, 0.09, 'sawtooth', v * 0.45, 70); break;
      case 'hailstorm': this._noise(0.07, 2900, 0.9, v * 0.8); this._tone(220, 0.05, 'square', v * 0.3, 110); break;
      case 'avalanche': this._noise(0.22, 900, 0.6, v * 1.1); this._tone(110, 0.16, 'sawtooth', v * 0.6, 45); break;
      case 'northstar': this._noise(0.28, 700, 0.5, v * 1.2); this._tone(95, 0.22, 'sawtooth', v * 0.7, 35); break;
      default: this._noise(0.1, 2000, 0.8, v);
    }
  }
  dry() { this._tone(1200, 0.04, 'square', 0.12); }
  reload() { this._tone(900, 0.05, 'square', 0.14); this._tone(620, 0.05, 'square', 0.14, 0, 0.12); this._tone(1100, 0.05, 'square', 0.16, 0, 0.3); }
  hit(head = false) { this._tone(head ? 2400 : 1700, 0.05, 'square', 0.2); }
  kill() { this._tone(660, 0.08, 'sine', 0.25); this._tone(990, 0.12, 'sine', 0.25, 0, 0.08); }
  hurt() { this._noise(0.12, 500, 0.7, 0.3); this._tone(130, 0.12, 'sine', 0.3, 70); }
  buy() { this._tone(880, 0.06, 'sine', 0.2); this._tone(1320, 0.09, 'sine', 0.2, 0, 0.07); }
  deny() { this._tone(180, 0.15, 'square', 0.2, 120); }
  roundWin() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.18, 'sine', 0.25, 0, i * 0.11)); }
  roundLose() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.22, 'sine', 0.22, 0, i * 0.13)); }
  captureTick() { this._tone(1250, 0.06, 'sine', 0.16); }
  captureDone() { [784, 1047, 1319].forEach((f, i) => this._tone(f, 0.14, 'sine', 0.22, 0, i * 0.09)); }
  flash() { this._noise(0.4, 3000, 0.5, 0.35); this._tone(2000, 0.3, 'sine', 0.1, 300); }
  step() { this._noise(0.05, 700, 0.6, 0.05); }
  click() { this._tone(1400, 0.03, 'square', 0.1); }
}
