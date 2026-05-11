// ── audio.js ──
// Procedural sound design system using Web Audio API.
// No external audio files — everything is synthesised with oscillators and noise.
//
// Architecture:
//   masterGain → destination
//     outdoorGain → masterGain   (filtered noise: wind/nature)
//     indoorGain  → masterGain   (filtered noise: warm room tone)
//   One-shot sounds are created fresh on each call and auto-disconnect.

let ctx = null;
let masterGain = null;
let outdoorGain = null;
let indoorGain = null;

// Ambient source nodes (kept running, volume controlled via gains)
let outdoorSource = null;

let indoorSource = null;
let birdSource = null;

let muted = true;
let audioResumed = false;

// ────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────

/**
 * Fill a buffer with white noise values between -1 and 1.
 * bufferSize controls the length; longer = less memory reuse,
 * but 2 seconds at 44100 is fine for looping ambience.
 */
function createNoiseBuffer(audioCtx, seconds = 2) {
  const sampleRate = audioCtx.sampleRate;
  const buffer = audioCtx.createBuffer(1, sampleRate * seconds, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Create a looping BufferSource from a noise buffer.
 */
function createNoiseSource(audioCtx, seconds = 2) {
  const source = audioCtx.createBufferSource();
  source.buffer = createNoiseBuffer(audioCtx, seconds);
  source.loop = true;
  return source;
}

/**
 * Smoothly ramp a GainNode to a target value over `time` seconds.
 */
function rampGain(gainNode, target, time = 0.5) {
  if (!gainNode) return;
  const now = ctx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(target, now + time);
}

// ────────────────────────────────────────────
// Ambient layer builders
// ────────────────────────────────────────────

function buildOutdoorAmbient() {
  // White noise → low-pass (wind body) → bandpass (wind whistle) → outdoorGain
  const source = createNoiseSource(ctx, 3);

  const lowPass = ctx.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.frequency.value = 400;
  lowPass.Q.value = 0.8;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 180;
  bandpass.Q.value = 0.4;

  // Mix: ~70% low-pass, 30% bandpass character by routing both to outdoorGain
  const lpGain = ctx.createGain();
  lpGain.gain.value = 0.7;
  const bpGain = ctx.createGain();
  bpGain.gain.value = 0.3;

  source.connect(lowPass);
  lowPass.connect(lpGain);
  lpGain.connect(outdoorGain);

  source.connect(bandpass);
  bandpass.connect(bpGain);
  bpGain.connect(outdoorGain);

  source.start();

  outdoorSource = source;
}

async function buildBirdAmbient() {
  try {
    const response = await fetch('/audio/birds.mp3');
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    birdSource = ctx.createBufferSource();
    birdSource.buffer = audioBuffer;
    birdSource.loop = true;

    const birdGain = ctx.createGain();
    birdGain.gain.value = 0.4;

    birdSource.connect(birdGain);
    birdGain.connect(outdoorGain);
    birdSource.start();
  } catch (err) {
    console.warn('Bird ambient: failed to load MP3', err);
  }
}

async function buildIndoorAmbient() {
  // Load MP3 file and loop it
  try {
    const response = await fetch('/audio/indoor-ambient.mp3');
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.connect(indoorGain);
    source.start();

    indoorSource = source;
  } catch (err) {
    console.warn('Indoor ambient: failed to load MP3', err);
  }
}

// ────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────

/**
 * Create the AudioContext and wire up all ambient layers.
 * Call this after a user gesture (click / scroll) — browsers block
 * audio contexts that are created before any interaction.
 * The context starts in a suspended state; call resumeAudio() to start sound.
 */
export function initAudio() {
  if (ctx) return; // already initialised

  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (err) {
    console.error('AudioContext creation failed:', err);
    return;
  }

  // Master gain — mute toggle operates here
  masterGain = ctx.createGain();
  masterGain.gain.value = 0; // start silent (muted = true); first click unmutes
  masterGain.connect(ctx.destination);

  // Outdoor gain (starts silent, ramped by scroll progress)
  outdoorGain = ctx.createGain();
  outdoorGain.gain.value = 0;
  outdoorGain.connect(masterGain);

  // Indoor gain (starts silent, ramped on state transitions)
  indoorGain = ctx.createGain();
  indoorGain.gain.value = 0;
  indoorGain.connect(masterGain);

  buildOutdoorAmbient();
  buildBirdAmbient();
  buildIndoorAmbient();
}

/**
 * Resume a suspended AudioContext.
 * Call on the first scroll or click so browsers allow audio.
 */
export function resumeAudio() {
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  audioResumed = true;
}

/**
 * Set outdoor ambient volume (0–1).
 * Called every frame from the render loop, keyed to scroll progress.
 */
export function setOutdoorVolume(v) {
  if (!outdoorGain) return;
  // Use a very short ramp so per-frame calls don't cause zipper noise
  const now = ctx.currentTime;
  outdoorGain.gain.cancelScheduledValues(now);
  outdoorGain.gain.setValueAtTime(outdoorGain.gain.value, now);
  outdoorGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)), now + 0.05);
}

/**
 * Set indoor ambient volume (0–1).
 * Called on state transitions with a longer crossfade.
 */
export function setIndoorVolume(v) {
  if (!indoorGain) return;
  rampGain(indoorGain, Math.max(0, Math.min(1, v)), 0.5);
}

/**
 * Short percussive pop — used for VN choice buttons and menu interactions.
 * Sine burst: 800 Hz, ~50 ms exponential decay.
 */
export function playClick() {
  if (!ctx || muted) return;
  resumeAudio();

  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 800;

  const now = ctx.currentTime;
  env.gain.setValueAtTime(0.18, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(env);
  env.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.06);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}

/**
 * Soft mechanical keyboard tap — used during computer boot sequence.
 * Short noise burst high-passed at 2 kHz, 30 ms.
 */
export function playType() {
  if (!ctx || muted) return;
  resumeAudio();

  const bufferSize = Math.floor(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // shaped noise
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 1.5;

  const env = ctx.createGain();
  const now = ctx.currentTime;
  env.gain.setValueAtTime(0.12, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  source.connect(filter);
  filter.connect(env);
  env.connect(masterGain);
  source.start(now);
  source.onended = () => { source.disconnect(); filter.disconnect(); env.disconnect(); };
}

/**
 * Gentle bell chime — used when clicking interactive objects in explore mode.
 * Sine at 880 Hz + 1320 Hz harmonic, 200 ms with exponential decay.
 */
export function playChime() {
  if (!ctx || muted) return;
  resumeAudio();

  const now = ctx.currentTime;

  function addPartial(freq, gainVal, decayTime) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(gainVal, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + decayTime);
    osc.connect(env);
    env.connect(masterGain);
    osc.start(now);
    osc.stop(now + decayTime + 0.01);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
  }

  addPartial(880, 0.14, 0.2);   // fundamental
  addPartial(1320, 0.07, 0.15); // perfect fifth harmonic
  addPartial(2200, 0.03, 0.08); // upper partial — faint shimmer
}

/**
 * Soft lamp click — low-pitched noise burst for toggling the lamp.
 */
export function playLampClick() {
  if (!ctx || muted) return;
  resumeAudio();

  const bufferSize = Math.floor(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 400;
  filter.Q.value = 1.2;

  const env = ctx.createGain();
  const now = ctx.currentTime;
  env.gain.setValueAtTime(0.15, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  source.connect(filter);
  filter.connect(env);
  env.connect(masterGain);
  source.start(now);
  source.onended = () => { source.disconnect(); filter.disconnect(); env.disconnect(); };
}

/**
 * Dribble sound — bandpass-filtered noise burst for basketball bouncing.
 */
export function playDribble(volume = 0.2, pitchMultiplier = 1.0) {
  if (!ctx || muted) return;
  resumeAudio();

  const bufferSize = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 200 * pitchMultiplier;
  filter.Q.value = 1.0;

  const env = ctx.createGain();
  const now = ctx.currentTime;
  env.gain.setValueAtTime(Math.min(volume, 0.3), now);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  source.connect(filter);
  filter.connect(env);
  env.connect(masterGain);
  source.start(now);
  source.onended = () => { source.disconnect(); filter.disconnect(); env.disconnect(); };
}

/**
 * Clock tick — very short, quiet sine burst.
 */
export function playTick(volume = 0.04) {
  if (!ctx || muted) return;
  resumeAudio();

  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 1000;

  const now = ctx.currentTime;
  env.gain.setValueAtTime(volume, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.01);

  osc.connect(env);
  env.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.015);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}

/**
 * Piano note — multi-harmonic synthesis with hammer attack for realistic sound.
 * Fundamental + overtones with natural decay, plus a brief noise transient
 * that mimics the hammer striking the string.
 */
export function playNote(frequency) {
  if (!ctx || muted) return;
  resumeAudio();

  const now = ctx.currentTime;

  // Higher notes decay faster, lower notes ring longer
  const baseDuration = Math.max(0.4, 1.8 - (frequency / 1000) * 1.2);

  // ── Harmonic partials (string vibration) ──
  const harmonics = [
    { mult: 1,   gain: 0.16, decay: baseDuration },       // fundamental
    { mult: 2,   gain: 0.08, decay: baseDuration * 0.8 },  // octave
    { mult: 3,   gain: 0.04, decay: baseDuration * 0.6 },  // perfect 5th above octave
    { mult: 4,   gain: 0.02, decay: baseDuration * 0.45 }, // 2nd octave
    { mult: 5,   gain: 0.01, decay: baseDuration * 0.3 },  // major 3rd above 2nd octave
  ];

  harmonics.forEach(({ mult, gain: vol, decay }) => {
    const freq = frequency * mult;
    if (freq > 16000) return; // skip inaudible overtones

    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;
    // Slight detuning on upper partials for warmth
    if (mult > 1) osc.detune.value = (Math.random() - 0.5) * 4;

    env.gain.setValueAtTime(vol, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + decay);

    osc.connect(env);
    env.connect(masterGain);
    osc.start(now);
    osc.stop(now + decay + 0.02);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
  });

  // ── Hammer attack (brief filtered noise transient) ──
  const attackDur = 0.015;
  const attackSize = Math.floor(ctx.sampleRate * attackDur);
  const attackBuf = ctx.createBuffer(1, attackSize, ctx.sampleRate);
  const attackData = attackBuf.getChannelData(0);
  for (let i = 0; i < attackSize; i++) {
    attackData[i] = (Math.random() * 2 - 1) * (1 - i / attackSize);
  }

  const attackSrc = ctx.createBufferSource();
  attackSrc.buffer = attackBuf;

  const attackFilter = ctx.createBiquadFilter();
  attackFilter.type = 'bandpass';
  attackFilter.frequency.value = Math.min(frequency * 3, 8000);
  attackFilter.Q.value = 0.8;

  const attackEnv = ctx.createGain();
  attackEnv.gain.setValueAtTime(0.12, now);
  attackEnv.gain.exponentialRampToValueAtTime(0.001, now + attackDur);

  attackSrc.connect(attackFilter);
  attackFilter.connect(attackEnv);
  attackEnv.connect(masterGain);
  attackSrc.start(now);
  attackSrc.onended = () => { attackSrc.disconnect(); attackFilter.disconnect(); attackEnv.disconnect(); };
}

/**
 * Toggle global mute on/off.
 * Returns the new muted state.
 */
export function toggleMute() {
  if (!ctx) return muted;
  muted = !muted;

  if (muted) {
    rampGain(masterGain, 0, 0.2);
  } else {
    resumeAudio();
    rampGain(masterGain, 1, 0.3);
  }

  return muted;
}

/**
 * Returns true if audio is currently muted.
 */
export function isMuted() {
  return muted;
}
