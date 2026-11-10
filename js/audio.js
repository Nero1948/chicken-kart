// All sound is synthesised with the Web Audio API, so there are no audio
// files to download. The engine is a constant oscillator whose pitch follows
// the kart's speed; everything else is short one-shot blips and noise bursts.

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineOscs = [];
    this.skidGain = null;
    this.muted = localStorage.getItem('ck_muted') === '1';
  }

  // Must be called from a user gesture (browsers block audio before one)
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    // Engine: two detuned saws through a lowpass filter
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    this.engineGain.connect(filter);
    filter.connect(this.master);
    for (const detune of [0, 8]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 70;
      osc.detune.value = detune;
      osc.connect(this.engineGain);
      osc.start();
      this.engineOscs.push(osc);
    }
    this.engineFilter = filter;

    // Tyre squeal: looping filtered noise that is faded up while drifting
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const skid = this.ctx.createBufferSource();
    skid.buffer = buf;
    skid.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1900;
    band.Q.value = 5;
    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0;
    skid.connect(band);
    band.connect(this.skidGain);
    this.skidGain.connect(this.master);
    skid.start();
    this.skidBand = band;
  }

  // Fade the tyre squeal in or out. `level` is the mini-turbo level (0-3),
  // which lifts the pitch so you can hear the charge build.
  setSkid(on, level = 0) {
    if (!this.ctx || !this.skidGain) return;
    const t = this.ctx.currentTime;
    this.skidGain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.05);
    this.skidBand.frequency.setTargetAtTime(1700 + level * 420, t, 0.1);
  }

  // Corn pickup: a bright pling that climbs in pitch as you chain them
  corn(streak) {
    const f = 880 * Math.pow(1.06, streak);
    this.tone(f, 0.09, { type: 'triangle', vol: 0.16 });
    this.tone(f * 1.5, 0.12, { type: 'sine', vol: 0.12, delay: 0.05 });
  }

  setEngine(speedNorm, boosting = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 62 + speedNorm * 125 + (boosting ? 28 : 0);
    const gain = speedNorm > 0.01 ? 0.035 + Math.min(1.3, speedNorm) * 0.045 : 0;
    this.engineFilter.frequency.setTargetAtTime(boosting ? 900 : 500, t, 0.1);
    for (const osc of this.engineOscs) {
      osc.frequency.setTargetAtTime(freq, t, 0.08);
    }
    this.engineGain.gain.setTargetAtTime(gain, t, 0.1);
  }

  engineOff() {
    if (!this.ctx) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    this.setSkid(false);
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('ck_muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    return this.muted;
  }

  tone(freq, dur, { type = 'square', vol = 0.18, slide = 0, delay = 0, vibRate = 0, vibDepth = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    // Optional vibrato: a slow LFO wavering the pitch, which makes animal
    // calls sound alive instead of like a flat electronic beep.
    let lfo, lfoGain;
    if (vibRate && vibDepth) {
      lfo = this.ctx.createOscillator();
      lfoGain = this.ctx.createGain();
      lfo.frequency.value = vibRate;
      lfoGain.gain.value = vibDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.25, freq = 800, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'beep':
        this.tone(440, 0.18, { vol: 0.22 });
        break;
      case 'go':
        this.tone(880, 0.45, { vol: 0.25 });
        break;
      case 'pickup':
        this.tone(660, 0.08, { vol: 0.16 });
        this.tone(880, 0.1, { vol: 0.16, delay: 0.07 });
        break;
      case 'gotItem':
        this.tone(523, 0.07, { vol: 0.16 });
        this.tone(659, 0.07, { vol: 0.16, delay: 0.06 });
        this.tone(784, 0.12, { vol: 0.16, delay: 0.12 });
        break;
      case 'boost':
        this.noise(0.5, { vol: 0.2, freq: 2500 });
        this.tone(220, 0.5, { type: 'sawtooth', vol: 0.14, slide: 660 });
        break;
      case 'bawk':
        // a proud cluck when you overtake a rival
        this.tone(620, 0.08, { type: 'triangle', vol: 0.15, slide: 180, vibRate: 26, vibDepth: 35 });
        this.tone(860, 0.11, { type: 'square', vol: 0.12, slide: 140, delay: 0.07 });
        break;
      case 'missile':
        this.noise(0.4, { vol: 0.18, freq: 1800 });
        this.tone(330, 0.35, { type: 'sawtooth', vol: 0.1, slide: 220 });
        break;
      case 'drop':
        this.tone(180, 0.15, { type: 'sine', vol: 0.2, slide: -80 });
        break;
      case 'explosion':
        this.noise(0.6, { vol: 0.35, freq: 900 });
        this.tone(90, 0.5, { type: 'sine', vol: 0.3, slide: -55 });
        break;
      case 'spin':
        this.tone(500, 0.4, { type: 'square', vol: 0.12, slide: -350 });
        break;
      case 'llama': {
        // a goofy bray/honk for the toy llama
        this.tone(300, 0.14, { type: 'sawtooth', vol: 0.18, slide: 140 });
        this.tone(440, 0.2, { type: 'sawtooth', vol: 0.16, slide: -200, delay: 0.12 });
        this.noise(0.12, { vol: 0.08, freq: 1200 });
        break;
      }
      case 'knock':
        this.noise(0.25, { vol: 0.32, freq: 500 });
        this.tone(120, 0.22, { type: 'sine', vol: 0.3, slide: -60 });
        break;
      case 'cluck': {
        // randomised so a barn full of chickens sounds lively, not looped: a
        // soft beak transient, a quick wavering "b-" blip, then the lower "-ok"
        // drop, with the occasional third syllable for a "bok-bok-bok".
        const base = 560 + Math.random() * 360;
        this.noise(0.03, { vol: 0.05, freq: 2600 });
        this.tone(base, 0.06, { type: 'triangle', vol: 0.11, slide: -90, vibRate: 30, vibDepth: 45 });
        this.tone(base * 0.74, 0.09, { type: 'square', vol: 0.10, slide: -150, delay: 0.07 });
        if (Math.random() < 0.3) {
          this.tone(base * 0.68, 0.08, { type: 'square', vol: 0.09, slide: -130, delay: 0.19 });
        }
        break;
      }
      case 'squawk':
        // panicked chicken when you clatter into one crossing the road
        this.tone(1150, 0.18, { type: 'sawtooth', vol: 0.22, slide: -750 });
        this.tone(820, 0.12, { type: 'square', vol: 0.16, slide: -300, delay: 0.12 });
        this.noise(0.14, { vol: 0.12, freq: 2200 });
        break;
      case 'moo': {
        // a long, lifelike cow moo: low and nasal, it swells open then falls
        // away, with a slow waver (vibrato) and a breathy tail. Built from a
        // rising "mmm" into a falling "ooo-aah", a sub-octave chest body, a
        // quiet nasal formant buzz, and a little breath of noise underneath.
        this.tone(140, 0.34, { type: 'triangle', vol: 0.30, slide: 70, vibRate: 6, vibDepth: 8 });
        this.tone(205, 0.46, { type: 'triangle', vol: 0.30, slide: -82, vibRate: 6, vibDepth: 9, delay: 0.30 });
        this.tone(70, 0.82, { type: 'sine', vol: 0.24, slide: 16 });
        this.tone(420, 0.5, { type: 'sawtooth', vol: 0.06, slide: -160, vibRate: 6, vibDepth: 10, delay: 0.06 });
        this.noise(0.4, { vol: 0.05, freq: 500, delay: 0.12 });
        break;
      }
      case 'moa': {
        // a startled Moa: a deep booming descending honk over the clatter of
        // its tossed-aside lawnmower.
        this.tone(330, 0.3, { type: 'sawtooth', vol: 0.24, slide: -210, vibRate: 14, vibDepth: 30 });
        this.tone(160, 0.4, { type: 'sine', vol: 0.22, slide: -70 });
        this.noise(0.3, { vol: 0.22, freq: 1400 });
        break;
      }
      case 'jump':
        // a springy launch off the ramp
        this.tone(280, 0.28, { type: 'square', vol: 0.16, slide: 520 });
        this.noise(0.18, { vol: 0.08, freq: 1600 });
        break;
      case 'hop':
        this.tone(330, 0.09, { type: 'triangle', vol: 0.12, slide: 200 });
        break;
      case 'land':
        this.noise(0.12, { vol: 0.14, freq: 500 });
        this.tone(110, 0.1, { type: 'sine', vol: 0.14, slide: -40 });
        break;
      case 'spark1':
        this.tone(1100, 0.1, { type: 'triangle', vol: 0.14, slide: 400 });
        break;
      case 'spark2':
        this.tone(1400, 0.12, { type: 'triangle', vol: 0.15, slide: 500 });
        break;
      case 'spark3':
        this.tone(1700, 0.08, { type: 'triangle', vol: 0.15, slide: 500 });
        this.tone(2200, 0.14, { type: 'triangle', vol: 0.14, slide: 400, delay: 0.07 });
        break;
      case 'miniturbo':
        this.noise(0.3, { vol: 0.16, freq: 2800 });
        this.tone(300, 0.3, { type: 'sawtooth', vol: 0.11, slide: 520 });
        break;
      case 'pad':
        this.noise(0.35, { vol: 0.18, freq: 3200 });
        this.tone(440, 0.32, { type: 'square', vol: 0.09, slide: 700 });
        break;
      case 'trick':
        this.tone(660, 0.08, { type: 'triangle', vol: 0.16 });
        this.tone(990, 0.08, { type: 'triangle', vol: 0.16, delay: 0.07 });
        this.tone(1320, 0.16, { type: 'triangle', vol: 0.16, delay: 0.14 });
        break;
      case 'slip':
        this.noise(0.55, { vol: 0.2, freq: 3600 });
        this.tone(500, 0.4, { type: 'sine', vol: 0.1, slide: 600 });
        break;
      case 'bump':
        this.noise(0.1, { vol: 0.2, freq: 700 });
        this.tone(150, 0.1, { type: 'square', vol: 0.12, slide: -50 });
        break;
      case 'bonk':
        this.tone(520, 0.07, { type: 'sine', vol: 0.12, slide: -200 });
        break;
      case 'throw':
        this.noise(0.2, { vol: 0.14, freq: 2400 });
        this.tone(700, 0.18, { type: 'sine', vol: 0.12, slide: -350 });
        break;
      case 'splat':
        this.noise(0.22, { vol: 0.28, freq: 600 });
        this.tone(200, 0.16, { type: 'sine', vol: 0.2, slide: -120 });
        break;
      case 'shield':
        this.tone(520, 0.3, { type: 'sine', vol: 0.16, slide: 520 });
        this.tone(780, 0.35, { type: 'sine', vol: 0.1, slide: 780, delay: 0.05 });
        break;
      case 'shieldPop':
        this.noise(0.15, { vol: 0.2, freq: 4000 });
        this.tone(1200, 0.18, { type: 'sine', vol: 0.16, slide: -900 });
        break;
      case 'chilli':
        this.noise(0.7, { vol: 0.22, freq: 2200 });
        this.tone(180, 0.7, { type: 'sawtooth', vol: 0.15, slide: 700 });
        break;
      case 'crow': {
        // cock-a-doodle-doo: five rising-and-falling syllables
        const notes = [[620, 0.12, 120], [620, 0.1, 80], [780, 0.14, 160], [700, 0.12, -40], [900, 0.5, -420]];
        let d = 0;
        for (const [f, dur, slide] of notes) {
          this.tone(f, dur, { type: 'sawtooth', vol: 0.2, slide, delay: d, vibRate: 22, vibDepth: 30 });
          this.tone(f * 1.5, dur, { type: 'square', vol: 0.07, slide, delay: d });
          d += dur + 0.03;
        }
        break;
      }
      case 'finalLap': {
        const notes = [784, 784, 784, 1047];
        notes.forEach((f, i) => this.tone(f, i === 3 ? 0.4 : 0.1, { vol: 0.18, delay: i * 0.13 }));
        break;
      }
      case 'lap':
        this.tone(880, 0.1, { vol: 0.14 });
        this.tone(1175, 0.18, { vol: 0.14, delay: 0.1 });
        break;
      case 'fanfare': {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => this.tone(f, 0.22, { vol: 0.2, delay: i * 0.16 }));
        this.tone(1047, 0.6, { vol: 0.2, delay: 0.64 });
        break;
      }
    }
  }
}

export const audio = new AudioSystem();
