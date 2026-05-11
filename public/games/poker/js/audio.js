/**
 * Poker Sound Effects — Real audio samples.
 *
 * Preloads short MP3 clips and plays them on demand.
 * Sources: Orange Free Sounds (CC BY-NC), BigSoundBank (CC0), Mixkit (free license).
 */

const BASE = './audio/';

const SOUNDS = {
  cardDeal:      'card-deal.mp3',
  cardFlip:      'card-flip.mp3',
  chipBet:       'chip-bet.mp3',
  chipStack:     'chip-stack.mp3',
  chipsWin:      'chips-win.mp3',
  check:         'check-tap.mp3',
  fold:          'fold-swoosh.mp3',
  blindsUp:      'blinds-up.mp3',
  winChime:      'win-chime.mp3',
  loseTone:      'lose-tone.mp3',
};

/** Preloaded Audio elements keyed by sound name. */
const cache = {};

// Preload all sounds on module load.
for (const [name, file] of Object.entries(SOUNDS)) {
  const audio = new Audio(BASE + file);
  audio.preload = 'auto';
  audio.volume = 0.5;
  cache[name] = audio;
}

/**
 * Play a cached sound. Clones the node so overlapping plays work
 * (e.g. two quick card deals).
 */
function play(name, volume) {
  const src = cache[name];
  if (!src) return;
  try {
    const clone = src.cloneNode();
    if (volume !== undefined) clone.volume = volume;
    clone.play().catch(() => {});
  } catch (_) { /* audio not available */ }
}

/** Resume audio context after user gesture (browser autoplay policy). */
export function unlock() {
  // With HTML Audio elements, just attempt a silent play to unlock.
  // Most browsers unlock on the first user-initiated play().
}

// ---------------------------------------------------------------------------
// Public API — same function signatures as before
// ---------------------------------------------------------------------------

export function cardDeal()       { play('cardDeal', 0.4); }
export function cardFlip()       { play('cardFlip', 0.5); }
export function chipBet()        { play('chipBet', 0.5); }
export function check()          { play('check', 0.35); }
export function fold()           { play('fold', 0.3); }
export function allIn()          { play('chipBet', 0.7); setTimeout(() => play('chipStack', 0.6), 80); }
export function winPot()         { play('chipsWin', 0.5); }
export function losePot()        { play('chipStack', 0.3); }
export function blindsUp()       { play('blindsUp', 0.4); }
export function communityCard()  { play('cardDeal', 0.35); }
export function gameOverWin()    { play('winChime', 0.6); }
export function gameOverLose()   { play('loseTone', 0.5); }
