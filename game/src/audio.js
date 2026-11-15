// Mirrorgrave — procedural audio. Everything is synthesized locally with Web Audio.
let ctx = null;
let master = null;
let windGain = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
    startWind();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function startWind() {
  // Looping filtered noise — a low cemetery wind with a slow LFO.
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02; // brown-ish
    d[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.8;
  windGain = ctx.createGain(); windGain.gain.value = 0.16;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.07;
  lfo.connect(lfoGain); lfoGain.connect(windGain.gain);
  src.connect(lp); lp.connect(windGain); windGain.connect(master);
  src.start(); lfo.start();

  // Deep drone — two detuned lows, barely audible
  const droneGain = ctx.createGain(); droneGain.gain.value = 0.035;
  for (const f of [55, 55.6, 110.3]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    o.connect(droneGain); o.start();
  }
  droneGain.connect(master);
}

function env(g, t0, peak, attack, decay, sustain = 0) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + attack + decay);
}

function tone(freq, { type = 'sine', peak = 0.3, attack = 0.01, decay = 0.8, delay = 0, detune = 0 } = {}) {
  const c = ac(); const t0 = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
  const g = c.createGain();
  env(g, t0, peak, attack, decay);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + attack + decay + 0.05);
}

function noiseBurst({ peak = 0.2, attack = 0.005, decay = 0.12, freq = 800, q = 1, delay = 0, type = 'bandpass' } = {}) {
  const c = ac(); const t0 = c.currentTime + delay;
  const len = Math.ceil(c.sampleRate * (attack + decay + 0.05));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); env(g, t0, peak, attack, decay);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

export const sfx = {
  unlock() { try { ac(); } catch (e) { /* audio unavailable */ } },
  footstep(sprint) {
    noiseBurst({ peak: sprint ? 0.16 : 0.08, decay: 0.07, freq: 500 + Math.random() * 300, q: 0.7 });
  },
  splash() {
    noiseBurst({ peak: 0.14, decay: 0.22, freq: 1400, q: 2.5 });
    tone(900, { type: 'sine', peak: 0.05, decay: 0.18 });
  },
  relic() {
    // Bright chime arpeggio
    [660, 990, 1320, 1760].forEach((f, i) => tone(f, { type: 'sine', peak: 0.22, decay: 1.4, delay: i * 0.09 }));
    tone(330, { type: 'triangle', peak: 0.12, decay: 1.6 });
  },
  bell() {
    // Grave bell: long inharmonic decay
    [98, 196, 294, 415].forEach((f, i) => tone(f, { type: i < 2 ? 'triangle' : 'sine', peak: 0.32 / (i + 1), attack: 0.005, decay: 4.2 - i * 0.7 }));
    noiseBurst({ peak: 0.1, decay: 0.05, freq: 2500, q: 4 });
  },
  alert() {
    tone(233, { type: 'sawtooth', peak: 0.16, attack: 0.02, decay: 0.5 });
    tone(247, { type: 'sawtooth', peak: 0.16, attack: 0.02, decay: 0.5 });
  },
  suspicious() { tone(392, { type: 'triangle', peak: 0.09, decay: 0.35 }); },
  caught() {
    tone(65, { type: 'sawtooth', peak: 0.4, attack: 0.03, decay: 2.2 });
    tone(98, { type: 'square', peak: 0.2, attack: 0.02, decay: 1.6, delay: 0.12 });
    noiseBurst({ peak: 0.3, decay: 0.9, freq: 180, q: 0.6, type: 'lowpass' });
  },
  victory() {
    // Dawn hymn — ascending major figure
    [392, 523.25, 587.33, 783.99, 1046.5].forEach((f, i) => tone(f, { type: 'sine', peak: 0.2, decay: 2.0, delay: i * 0.16 }));
    tone(196, { type: 'triangle', peak: 0.16, decay: 3.2, delay: 0.3 });
  },
  defeat() {
    [330, 311, 233, 155].forEach((f, i) => tone(f, { type: 'triangle', peak: 0.17, decay: 1.8, delay: i * 0.3 }));
  },
  uiClick() { tone(1200, { type: 'sine', peak: 0.06, decay: 0.08 }); },
  lantern() { tone(1560, { type: 'sine', peak: 0.07, decay: 0.25 }); noiseBurst({ peak: 0.05, decay: 0.05, freq: 3000, q: 3 }); },
  hide() { noiseBurst({ peak: 0.07, decay: 0.15, freq: 900, q: 0.8 }); },
  heartbeat() { tone(58, { type: 'sine', peak: 0.5, attack: 0.01, decay: 0.18 }); tone(52, { type: 'sine', peak: 0.4, attack: 0.01, decay: 0.16, delay: 0.22 }); },
  barge() { tone(320, { type: 'triangle', peak: 0.2, decay: 1.1 }); tone(480, { type: 'sine', peak: 0.14, decay: 1.4, delay: 0.18 }); },
};
