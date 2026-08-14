/* Tiny Web Audio synth — every sound is generated, no external assets. */
import { S } from './state';

interface SoundEngine {
  ac: AudioContext | null;
  g: GainNode | null;
  muted: boolean;
  init(): void;
  t(type: OscillatorType, f0: number, f1: number, dur: number, vol: number): void;
  n(dur: number, vol: number): void;
  play(name: string, fast?: boolean): void;
}

export const Snd: SoundEngine = {
  ac: null,
  g: null,
  muted: false,

  init: function () {
    if (this.ac) return;
    try {
      this.ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.g = this.ac.createGain();
      this.g.gain.value = .14;
      this.g.connect(this.ac.destination);
    } catch (e) { /* audio unavailable */ }
  },

  /** Tone sweep. */
  t: function (type, f0, f1, dur, vol) {
    if (this.muted || !this.ac || !this.g) return;
    var o = this.ac.createOscillator(), g = this.ac.createGain(), t = this.ac.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g);
    g.connect(this.g);
    o.start(t);
    o.stop(t + dur + .02);
  },

  /** Noise burst. */
  n: function (dur, vol) {
    if (this.muted || !this.ac || !this.g) return;
    var b = this.ac.createBuffer(1, this.ac.sampleRate * dur, this.ac.sampleRate),
        d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    var s = this.ac.createBufferSource(), g = this.ac.createGain();
    s.buffer = b;
    g.gain.value = vol;
    s.connect(g);
    g.connect(this.g);
    s.start();
  },

  play: function (name, fast) {
    if (fast && S.speed > 6) return;
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
    if (this.ac && this.ac.state !== 'running') return;
    switch (name) {
      case 'shoot': this.t('square', 920, 240, .06, .5); break;
      case 'arc': this.t('sawtooth', 340, 70, .11, .5); break;
      case 'beam': this.t('sine', 520, 760, .09, .35); break;
      case 'capture':
        this.t('sine', 620, 620, .09, .6);
        var s = this;
        setTimeout(function () { s.t('sine', 930, 1240, .14, .6); }, 80);
        break;
      case 'boom': this.n(.22, .7); this.t('sine', 150, 40, .2, .7); break;
      case 'rail': this.t('square', 1500, 160, .13, .6); this.n(.08, .4); break;
      case 'surge': this.t('sawtooth', 180, 940, .32, .6); this.n(.12, .35); break;
      case 'weld': this.t('triangle', 320, 540, .1, .5); this.n(.06, .3); this.t('triangle', 540, 760, .12, .4); break;
      case 'leak': this.t('sine', 110, 55, .3, .9); this.n(.15, .5); break;
      case 'wave': this.t('sawtooth', 98, 98, .32, .55); this.t('sawtooth', 147, 147, .32, .4); break;
      case 'place': this.t('triangle', 420, 640, .08, .6); break;
      case 'upgrade':
        this.t('triangle', 440, 880, .1, .55);
        var u = this;
        setTimeout(function () { u.t('triangle', 660, 1320, .12, .5); }, 70);
        break;
      case 'error': this.t('square', 130, 90, .12, .6); break;
      case 'ui': this.t('sine', 900, 700, .04, .35); break;
      case 'draft': this.t('sine', 520, 780, .16, .55); this.t('triangle', 1040, 1560, .2, .3); break;
      case 'fanfare':
        this.t('sawtooth', 196, 196, .3, .5);
        var f = this;
        setTimeout(function () { f.t('sawtooth', 294, 294, .3, .5); }, 120);
        setTimeout(function () { f.t('sawtooth', 392, 588, .4, .5); }, 240);
        break;
    }
  }
};
