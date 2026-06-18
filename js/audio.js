// All sound is synthesised with the Web Audio API, so there are no audio
// files to download. The engine is a constant oscillator whose pitch follows
// the kart's speed; everything else is short one-shot blips and noise bursts.
// The looping background music is built the same way: a little step sequencer
// plays short note patterns through the same tone()/noise() voices.

// Note frequencies (Hz) for the music patterns. 0 is a rest.
const NOTE = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, CS4: 277.18, D4: 293.66, E4: 329.63, F4: 349.23, FS4: 369.99, G4: 392.0,
  GS4: 415.3, A4: 440.0, B4: 493.88,
  C5: 523.25, CS5: 554.37, D5: 587.33, E5: 659.25, F5: 698.46, FS5: 739.99,
  G5: 783.99, GS5: 830.61, A5: 880.0,
};
const _ = 0; // shorthand for a rest in the pattern arrays below

// How loud the music bus sits. Kept well under the engine and sound effects so
// it never competes with the gameplay audio.
const MUSIC_LEVEL = 0.55;

// Each theme is a looping pattern: a bass line, a lead melody and an optional
// percussion tick, all the same length, played one step at a time. `step` is
// the seconds per step (smaller = faster). Each track gets its own key/tempo so
// the four circuits feel different.
const N = NOTE;
const THEMES = {
  // Relaxed, friendly I-V-vi-IV in C for the menus.
  menu: {
    step: 0.19,
    bass: [N.C3, _, _, _, N.G2, _, _, _, N.A2, _, _, _, N.F2, _, _, _],
    lead: [N.E4, _, N.G4, _, N.D4, _, N.G4, _, N.C4, _, N.E4, _, N.C4, _, N.D4, _],
    drum: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  },
  // Funny Farm: bouncy country hoedown in G.
  farm: {
    step: 0.15,
    bass: [N.G2, _, N.D3, _, N.G2, _, N.D3, _, N.C3, _, N.G2, _, N.D3, _, N.D3, _],
    lead: [N.G4, N.B4, N.D5, N.B4, N.G4, N.B4, N.D5, N.B4, N.E4, N.G4, N.C5, N.G4, N.FS4, N.A4, N.D5, N.A4],
    drum: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  // Chickens in the City: funky, driving A minor.
  city: {
    step: 0.14,
    bass: [N.A2, _, N.A2, N.E3, N.A2, _, N.C3, _, N.F2, _, N.G2, _, N.A2, _, N.E3, _],
    lead: [N.A4, _, N.C5, N.A4, N.E5, _, N.C5, N.A4, N.F4, _, N.A4, _, N.G4, N.B4, N.E5, _],
    drum: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0],
  },
  // Tongariro Park: airy, epic D major.
  park: {
    step: 0.2,
    bass: [N.D3, _, _, _, N.A2, _, _, _, N.B2, _, _, _, N.G2, _, _, _],
    lead: [N.D5, _, N.FS5, _, N.A4, _, N.E5, _, N.B4, _, N.D5, _, N.A4, _, N.FS5, _],
    drum: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
  },
  // Mt Maunganui Beach: bright, surfy E major.
  beach: {
    step: 0.16,
    bass: [N.E3, _, N.B2, _, N.E3, _, N.B2, _, N.A2, _, N.E3, _, N.B2, _, N.B2, _],
    lead: [N.E5, _, N.CS5, _, N.B4, _, N.GS4, _, N.E5, _, N.FS5, _, N.GS5, _, N.E5, _],
    drum: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
};

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineOscs = [];
    this.musicGain = null;
    this.music = { timer: null, themeId: null, step: 0, nextTime: 0 };
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

    // Music bus: the sequencer routes every note here so the whole soundtrack
    // can be balanced (and ducked for the victory fanfare) with one gain node.
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = MUSIC_LEVEL;
    this.musicGain.connect(this.master);
  }

  setEngine(speedNorm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 65 + speedNorm * 120;
    const gain = speedNorm > 0.01 ? 0.035 + speedNorm * 0.045 : 0;
    for (const osc of this.engineOscs) {
      osc.frequency.setTargetAtTime(freq, t, 0.08);
    }
    this.engineGain.gain.setTargetAtTime(gain, t, 0.1);
  }

  engineOff() {
    if (this.ctx) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  // Start (or switch to) a looping music theme. `themeId` is 'menu' or a track
  // id ('farm' | 'city' | 'park' | 'beach'). Calling it again with the theme
  // that is already playing is a no-op, so it is safe to call every frame.
  startMusic(themeId) {
    if (!this.ctx) return;
    if (!THEMES[themeId]) themeId = 'menu';
    if (this.music.themeId === themeId && this.music.timer) return;
    this.stopMusic();
    this.music.themeId = themeId;
    this.music.step = 0;
    this.music.nextTime = this.ctx.currentTime + 0.08;
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(MUSIC_LEVEL, this.ctx.currentTime, 0.1);
    }
    // A lookahead scheduler: a coarse timer that queues the precisely-timed
    // notes just ahead of the clock, which keeps the rhythm rock-steady even
    // though setInterval itself is jittery.
    this.music.timer = setInterval(() => this._tickMusic(), 25);
  }

  stopMusic() {
    if (this.music.timer) {
      clearInterval(this.music.timer);
      this.music.timer = null;
    }
    this.music.themeId = null;
  }

  // Briefly drop the music volume (used so the victory fanfare cuts through),
  // then ease it back up.
  duckMusic(dur = 1.6) {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(MUSIC_LEVEL * 0.2, t, 0.05);
    this.musicGain.gain.setTargetAtTime(MUSIC_LEVEL, t + dur, 0.4);
  }

  _tickMusic() {
    if (!this.ctx) return;
    const theme = THEMES[this.music.themeId];
    if (!theme) return;
    const lookahead = 0.12;
    const len = theme.bass.length;
    while (this.music.nextTime < this.ctx.currentTime + lookahead) {
      this._scheduleStep(theme, this.music.step, this.music.nextTime);
      this.music.nextTime += theme.step;
      this.music.step = (this.music.step + 1) % len;
    }
  }

  _scheduleStep(theme, step, time) {
    const delay = Math.max(0, time - this.ctx.currentTime);
    const bus = this.musicGain;
    const bass = theme.bass[step];
    if (bass) {
      this.tone(bass, theme.step * 3.4, { type: 'triangle', vol: 0.16, delay, bus });
    }
    const lead = theme.lead[step];
    if (lead) {
      this.tone(lead, theme.step * 0.92, { type: 'square', vol: 0.12, delay, bus });
    }
    if (theme.drum && theme.drum[step]) {
      this.noise(0.04, { vol: 0.05, freq: 1900, delay, bus });
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('ck_muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    return this.muted;
  }

  tone(freq, dur, { type = 'square', vol = 0.18, slide = 0, delay = 0, vibRate = 0, vibDepth = 0, bus = null } = {}) {
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
    g.connect(bus || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.25, freq = 800, delay = 0, bus = null } = {}) {
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
    g.connect(bus || this.master);
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
