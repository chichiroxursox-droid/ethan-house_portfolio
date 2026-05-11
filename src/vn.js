import gsap from 'gsap';
import { playClick, setIndoorVolume } from './audio.js';

// ── DOM refs ──
let overlay = null;
let sprite = null;
let talkingEl = null;
let textEl = null;
let choicesEl = null;
let choiceButtons = [];

// ── Config ──
let onChoice = null;
const GREETING_TEXT = "Hi, I'm Ethan! Welcome to my digital portfolio!";
const TYPE_SPEED = 40; // ms per character

// ── State ──
let typeInterval = null;
let hasGreeted = false;
const pendingTimeouts = [];

// ── Sprite preload cache ──
const spriteCache = {};
const EXPRESSIONS = ['wave', 'smile', 'chat', 'listen'];
let talkingVideo = null;

function preloadSprites() {
  for (const name of EXPRESSIONS) {
    const img = new Image();
    img.src = `/character/${name}.png`;
    spriteCache[name] = img;
  }
  // Preload talking video
  talkingVideo = document.createElement('video');
  talkingVideo.src = '/character/talking.webm';
  talkingVideo.loop = true;
  talkingVideo.muted = true;
  talkingVideo.playsInline = true;
  talkingVideo.preload = 'auto';
}

// ── Typewriter ──

function typeText(text, callback) {
  textEl.textContent = '';
  textEl.classList.add('typing');
  let i = 0;

  typeInterval = setInterval(() => {
    textEl.textContent += text[i];
    i++;
    if (i >= text.length) {
      clearInterval(typeInterval);
      typeInterval = null;
      textEl.classList.remove('typing');
      if (callback) callback();
    }
  }, TYPE_SPEED);
}

function stopTypewriter() {
  if (typeInterval) {
    clearInterval(typeInterval);
    typeInterval = null;
  }
  textEl.classList.remove('typing');
}

// ── Show / Hide helpers ──

function showChoices() {
  choicesEl.style.display = 'flex';
  choiceButtons.forEach((btn, i) => {
    setTimeout(() => btn.classList.add('visible'), i * 120);
  });
}

function hideChoices() {
  choiceButtons.forEach((btn) => btn.classList.remove('visible'));
  choicesEl.style.display = 'none';
}

// ── Public API ──

function startTalking() {
  if (!talkingEl) return;
  sprite.style.display = 'none';
  talkingEl.style.display = '';
  talkingEl.currentTime = 0;
  talkingEl.play().catch(() => {});
}

function stopTalking() {
  if (!talkingEl) return;
  talkingEl.pause();
  talkingEl.style.display = 'none';
  sprite.style.display = '';
}

export function initVN({ onChoice: choiceCb }) {
  overlay = document.getElementById('vn-overlay');
  sprite = document.getElementById('vn-sprite');
  talkingEl = document.getElementById('vn-talking');
  textEl = document.getElementById('vn-text');
  choicesEl = document.getElementById('vn-choices');
  choiceButtons = Array.from(choicesEl.querySelectorAll('.vn-choice'));

  onChoice = choiceCb;

  // Wire choice buttons
  choiceButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      playClick();
      const action = btn.dataset.action;
      if (onChoice) onChoice(action);
    });
  });

  preloadSprites();
}

export function showGreeting() {
  // Reset state
  stopTypewriter();
  hideChoices();
  textEl.textContent = '';
  setExpression('wave');

  // Show overlay
  overlay.style.display = 'flex';
  gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.5 });

  // Slide in sprite — start indoor music when Ethan appears
  pendingTimeouts.push(setTimeout(() => {
    sprite.classList.add('visible');
    setIndoorVolume(0.15);
  }, 100));

  // Show dialogue box
  const dialogue = overlay.querySelector('.vn-dialogue');
  pendingTimeouts.push(setTimeout(() => dialogue.classList.add('visible'), 400));

  // Start typewriter after dialogue is visible
  pendingTimeouts.push(setTimeout(() => {
    typeText(GREETING_TEXT, () => {
      // After typing completes, pause then switch to smile and show choices
      pendingTimeouts.push(setTimeout(() => {
        setExpression('smile');
        showChoices();
      }, 800));
    });
  }, 900));

  hasGreeted = true;
}

export function showMenu() {
  // Show overlay with choices immediately (no typewriter replay)
  setExpression('smile');
  textEl.textContent = GREETING_TEXT;
  textEl.classList.remove('typing');

  // Kill any in-flight hideVN fade that might be tweening opacity toward 0.
  gsap.killTweensOf(overlay);

  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  sprite.classList.add('visible');
  overlay.querySelector('.vn-dialogue').classList.add('visible');

  showChoices();
}

export function hideChoicesOnly() {
  stopTypewriter();
  hideChoices();
}

export function hideVN() {
  stopTypewriter();
  stopTalking();
  hideChoices();
  // Clear any pending greeting animation timeouts
  pendingTimeouts.forEach(id => clearTimeout(id));
  pendingTimeouts.length = 0;

  gsap.to(overlay, {
    opacity: 0,
    duration: 0.4,
    onComplete: () => {
      overlay.style.display = 'none';
      sprite.classList.remove('visible');
      overlay.querySelector('.vn-dialogue').classList.remove('visible');
    },
  });
}

export function setExpression(name) {
  if (sprite && EXPRESSIONS.includes(name)) {
    stopTalking();
    sprite.src = `/character/${name}.png`;
  }
}
