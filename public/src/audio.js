// Procedural audio: ambient drone + footsteps + chase stinger.
// No external audio files needed — everything is synthesized with the Web Audio API.

let ctx = null;
let master = null;
let droneGain = null;
let tensionGain = null;
let started = false;
let lastStepAt = 0;

function ensureContext() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function startAmbient() {
  ensureContext();
  if (started || ctx.state === 'closed') return;
  if (ctx.state === 'suspended') ctx.resume();
  started = true;

  // low drone (two detuned oscillators through a slow filter sweep)
  droneGain = ctx.createGain();
  droneGain.gain.value = 0.18;
  droneGain.connect(master);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  filter.connect(droneGain);
  [55, 58.5].forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.connect(filter);
    osc.start();
  });
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 150;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  // tension layer, silent until alarm/chase raises it
  tensionGain = ctx.createGain();
  tensionGain.gain.value = 0;
  tensionGain.connect(master);
  const tOsc = ctx.createOscillator();
  tOsc.type = 'square';
  tOsc.frequency.value = 110;
  const tLfo = ctx.createOscillator();
  tLfo.frequency.value = 5;
  const tLfoGain = ctx.createGain();
  tLfoGain.gain.value = 0.5;
  const tGainNode = ctx.createGain();
  tGainNode.gain.value = 0.5;
  tLfo.connect(tLfoGain);
  tLfoGain.connect(tGainNode.gain);
  tOsc.connect(tGainNode);
  tGainNode.connect(tensionGain);
  tOsc.start();
  tLfo.start();
}

export function setTension(level) {
  // level: 0 (calm) .. 1 (full chase/alarm)
  if (!tensionGain) return;
  const target = Math.max(0, Math.min(1, level)) * 0.35;
  tensionGain.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
}

export function playFootstep(strength) {
  if (!ctx) return;
  const now = Date.now();
  const interval = 420 - Math.min(strength, 1) * 250;
  if (now - lastStepAt < interval) return;
  lastStepAt = now;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 90 + Math.random() * 20;
  const gain = ctx.createGain();
  gain.gain.value = 0.05 + strength * 0.2;
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.stop(ctx.currentTime + 0.13);
}

export function playStinger() {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.6);
  const gain = ctx.createGain();
  gain.gain.value = 0.3;
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc.stop(ctx.currentTime + 0.65);
}

export function playPickup() {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
  const gain = ctx.createGain();
  gain.gain.value = 0.15;
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.stop(ctx.currentTime + 0.22);
}
