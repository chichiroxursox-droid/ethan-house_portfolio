import gsap from 'gsap';

export const STATES = {
  SCROLLING: 'SCROLLING',
  GREETING: 'GREETING',
  MENU: 'MENU',
  COMPUTER: 'COMPUTER',
  EXPLORING: 'EXPLORING',
  ABOUT: 'ABOUT',
};

let current = STATES.SCROLLING;
let lenis = null;
const listeners = [];

export function initState(lenisInstance) {
  lenis = lenisInstance;
}

export function getState() {
  return current;
}

export function onStateChange(cb) {
  listeners.push(cb);
}

export function transitionTo(newState) {
  if (newState === current) return;
  const old = current;

  // Exit old state
  exitState(old);

  current = newState;

  // Enter new state
  enterState(newState, old);

  // Notify listeners
  for (const cb of listeners) cb(newState, old);
}

function exitState(state) {
  switch (state) {
    case STATES.SCROLLING:
      if (lenis) lenis.stop();
      break;
    case STATES.GREETING:
      break;
    case STATES.MENU:
      break;
    case STATES.COMPUTER:
      hideOverlay('computer-overlay');
      break;
    case STATES.EXPLORING:
      hideOverlay('explore-overlay');
      break;
    case STATES.ABOUT:
      hideOverlay('about-overlay');
      break;
  }
}

function enterState(state) {
  switch (state) {
    case STATES.SCROLLING:
      if (lenis) lenis.start();
      break;
    case STATES.GREETING:
      break;
    case STATES.MENU:
      break;
    case STATES.COMPUTER:
      showOverlay('computer-overlay');
      break;
    case STATES.EXPLORING:
      showOverlay('explore-overlay');
      break;
    case STATES.ABOUT:
      showOverlay('about-overlay');
      break;
  }
}

function showOverlay(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'flex';
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5 });
  }
}

function hideOverlay(id) {
  const el = document.getElementById(id);
  if (el) {
    gsap.to(el, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => { el.style.display = 'none'; },
    });
  }
}
