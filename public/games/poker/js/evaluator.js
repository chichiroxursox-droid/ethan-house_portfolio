/**
 * Poker Hand Evaluator — Pure client-side ES6 module.
 *
 * Evaluates 5-card poker hands, finds the best hand from 7 cards,
 * calculates Monte Carlo equity, and estimates drawing outs.
 *
 * Card format: { rank: '2'|'3'|...|'T'|'J'|'Q'|'K'|'A', suit: 's'|'h'|'d'|'c' }
 *
 * Lower rank number = better hand (matches treys convention).
 * Class hierarchy: 1=Straight Flush, 2=Four of a Kind, 3=Full House,
 * 4=Flush, 5=Straight, 6=Three of a Kind, 7=Two Pair, 8=One Pair, 9=High Card.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

/** Map rank character to numeric value (2=0, 3=1, ..., A=12). */
const RANK_VAL = Object.freeze(
  Object.fromEntries(RANKS.map((r, i) => [r, i]))
);

/** Scale factor per hand class — sub-rank fits within 100000. */
const CLASS_SCALE = 100000;

// ---------------------------------------------------------------------------
// Deck helpers
// ---------------------------------------------------------------------------

/**
 * Create a standard 52-card deck.
 * @returns {{ rank: string, suit: string }[]}
 */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ rank, suit });
  return deck;
}

/**
 * Generate a unique key for a card (used for set operations).
 * @param {{ rank: string, suit: string }} card
 * @returns {string}
 */
function cardKey(card) {
  return card.rank + card.suit;
}

/**
 * Fisher-Yates shuffle (in-place).
 * @param {any[]} arr
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// ---------------------------------------------------------------------------
// Combination generator
// ---------------------------------------------------------------------------

/**
 * Generate all C(n, k) combinations of an array.
 * @param {any[]} arr
 * @param {number} k
 * @returns {any[][]}
 */
function combinations(arr, k) {
  const result = [];
  const combo = new Array(k);

  function recurse(start, depth) {
    if (depth === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i <= arr.length - (k - depth); i++) {
      combo[depth] = arr[i];
      recurse(i + 1, depth + 1);
    }
  }

  recurse(0, 0);
  return result;
}

// ---------------------------------------------------------------------------
// rankHand — evaluate exactly 5 cards
// ---------------------------------------------------------------------------

/**
 * Evaluate a 5-card poker hand.
 *
 * Returns a numeric rank where lower = better.
 * Format: handClass * 100000 + subRank.
 *
 * @param {{ rank: string, suit: string }[]} fiveCards
 * @returns {number}
 */
export function rankHand(fiveCards) {
  // Extract numeric values and sort descending.
  const vals = fiveCards.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);

  // Check flush: all suits identical.
  const isFlush =
    fiveCards[0].suit === fiveCards[1].suit &&
    fiveCards[1].suit === fiveCards[2].suit &&
    fiveCards[2].suit === fiveCards[3].suit &&
    fiveCards[3].suit === fiveCards[4].suit;

  // Check straight: 5 distinct values with span of 4, or the wheel (A-2-3-4-5).
  let isStraight = false;
  let straightHigh = 0;

  if (
    vals[0] - vals[4] === 4 &&
    new Set(vals).size === 5
  ) {
    isStraight = true;
    straightHigh = vals[0];
  } else if (
    // Wheel: A(12) 5(3) 4(2) 3(1) 2(0)
    vals[0] === 12 && vals[1] === 3 && vals[2] === 2 && vals[3] === 1 && vals[4] === 0
  ) {
    isStraight = true;
    straightHigh = 3; // 5-high straight; ace plays low
  }

  // Count rank frequencies for pair/trips/quads detection.
  const freq = new Array(13).fill(0);
  for (let i = 0; i < 5; i++) freq[RANK_VAL[fiveCards[i].rank]]++;

  // Group by frequency: build arrays of [count, rankVal] sorted for tie-breaking.
  // Sort by count desc, then rankVal desc.
  const groups = [];
  for (let v = 12; v >= 0; v--) {
    if (freq[v] > 0) groups.push([freq[v], v]);
  }
  groups.sort((a, b) => b[0] - a[0] || b[1] - a[1]);

  // Determine hand class and sub-rank.
  const topCount = groups[0][0];
  const secondCount = groups.length > 1 ? groups[1][0] : 0;

  // Sub-rank encodes kicker order as a base-13 number for unambiguous comparison.
  // groups is sorted by (count desc, rank desc). We invert rank values so that
  // higher poker ranks (Ace=12) produce LOWER sub-rank numbers (lower = better).
  function subRank() {
    let s = 0;
    for (let i = 0; i < groups.length; i++) {
      s = s * 13 + (12 - groups[i][1]);
    }
    return s;
  }

  // --- Straight Flush (class 1) ---
  if (isFlush && isStraight) {
    // Higher straightHigh = better hand = lower rank number.
    // Invert so that A-high (straightHigh=12) is rank 0, wheel (straightHigh=3) is rank 9.
    return 1 * CLASS_SCALE + (12 - straightHigh);
  }

  // --- Four of a Kind (class 2) ---
  if (topCount === 4) {
    return 2 * CLASS_SCALE + subRank();
  }

  // --- Full House (class 3) ---
  if (topCount === 3 && secondCount === 2) {
    return 3 * CLASS_SCALE + subRank();
  }

  // --- Flush (class 4) ---
  if (isFlush) {
    // Compare ranks high to low. Pack the 5 sorted values.
    let s = 0;
    for (let i = 0; i < 5; i++) s = s * 13 + vals[i];
    return 4 * CLASS_SCALE + (371292 - s);
    // 371292 = 12*13^4 + 12*13^3 + 12*13^2 + 12*13 + 12 (max possible)
    // Invert so that higher flush = lower rank number.
  }

  // --- Straight (class 5) ---
  if (isStraight) {
    return 5 * CLASS_SCALE + (12 - straightHigh);
  }

  // --- Three of a Kind (class 6) ---
  if (topCount === 3) {
    return 6 * CLASS_SCALE + subRank();
  }

  // --- Two Pair (class 7) ---
  if (topCount === 2 && secondCount === 2) {
    return 7 * CLASS_SCALE + subRank();
  }

  // --- One Pair (class 8) ---
  if (topCount === 2) {
    return 8 * CLASS_SCALE + subRank();
  }

  // --- High Card (class 9) ---
  {
    let s = 0;
    for (let i = 0; i < 5; i++) s = s * 13 + vals[i];
    return 9 * CLASS_SCALE + (371292 - s);
  }
}

// ---------------------------------------------------------------------------
// bestHand — find the best 5-card hand from hole + community cards
// ---------------------------------------------------------------------------

/**
 * Given 2 hole cards and 3-5 community cards, find the best 5-card hand.
 *
 * @param {{ rank: string, suit: string }[]} holeCards - exactly 2 cards
 * @param {{ rank: string, suit: string }[]} communityCards - 3, 4, or 5 cards
 * @returns {{ rank: number, cards: { rank: string, suit: string }[] }}
 */
export function bestHand(holeCards, communityCards) {
  const allCards = holeCards.concat(communityCards);
  const combos = combinations(allCards, 5);

  let bestRank = Infinity;
  let bestCards = null;

  for (let i = 0; i < combos.length; i++) {
    const r = rankHand(combos[i]);
    if (r < bestRank) {
      bestRank = r;
      bestCards = combos[i];
    }
  }

  return { rank: bestRank, cards: bestCards };
}

// ---------------------------------------------------------------------------
// handPercentile — convert rank to 0.0-1.0 percentile
// ---------------------------------------------------------------------------

/**
 * Convert a hand rank to a percentile (0.0 = worst, 1.0 = best).
 *
 * Uses approximate class ranges based on the probability distribution
 * of poker hands, with linear interpolation within each class.
 *
 * @param {number} rank
 * @returns {number}
 */
export function handPercentile(rank) {
  const handClass = Math.floor(rank / CLASS_SCALE);
  const sub = rank % CLASS_SCALE;

  // Each entry: [class, percentileLow, percentileHigh, maxSubRank]
  // percentileLow = worst hand in this class, percentileHigh = best hand in this class
  const ranges = [
    [1, 0.99,  1.00,  9],      // Straight Flush (10 possible straight-highs)
    [2, 0.98,  0.99,  12 * 13 + 12],   // Four of a Kind
    [3, 0.96,  0.98,  12 * 13 + 12],   // Full House
    [4, 0.94,  0.96,  371292],  // Flush
    [5, 0.92,  0.94,  12],     // Straight
    [6, 0.85,  0.92,  12 * 13 * 13 + 12 * 13 + 12], // Three of a Kind
    [7, 0.72,  0.85,  12 * 13 * 13 + 12 * 13 + 12], // Two Pair
    [8, 0.40,  0.72,  12 * 13 * 13 * 13 + 12 * 13 * 13 + 12 * 13 + 12], // One Pair
    [9, 0.00,  0.40,  371292],  // High Card
  ];

  for (const [cls, lo, hi, maxSub] of ranges) {
    if (handClass === cls) {
      // sub = 0 is the best hand in the class, maxSub is the worst.
      // Interpolate: best in class = hi, worst in class = lo.
      const t = maxSub > 0 ? Math.min(sub / maxSub, 1.0) : 0;
      return hi - t * (hi - lo);
    }
  }

  // Fallback (should not happen with valid ranks).
  return 0.5;
}

// ---------------------------------------------------------------------------
// handCategory — human-readable hand name
// ---------------------------------------------------------------------------

/**
 * Return the human-readable name of a hand given its rank.
 *
 * @param {number} rank
 * @returns {string}
 */
export function handCategory(rank) {
  const handClass = Math.floor(rank / CLASS_SCALE);
  const sub = rank % CLASS_SCALE;

  // Special case: Royal Flush is a straight flush with sub-rank 0
  // (A-high straight flush, straightHigh = 12, inverted to 0).
  if (handClass === 1 && sub === 0) return 'Royal Flush';

  const names = {
    1: 'Straight Flush',
    2: 'Four of a Kind',
    3: 'Full House',
    4: 'Flush',
    5: 'Straight',
    6: 'Three of a Kind',
    7: 'Two Pair',
    8: 'One Pair',
    9: 'High Card',
  };

  return names[handClass] || 'Unknown';
}

// ---------------------------------------------------------------------------
// compareHands
// ---------------------------------------------------------------------------

/**
 * Compare two hand ranks.
 * Returns negative if hand1 wins, positive if hand2 wins, 0 for tie.
 *
 * @param {number} rank1
 * @param {number} rank2
 * @returns {number}
 */
export function compareHands(rank1, rank2) {
  return rank1 - rank2;
}

// ---------------------------------------------------------------------------
// calculateEquity — Monte Carlo simulation
// ---------------------------------------------------------------------------

/**
 * Monte Carlo equity calculation against 1 random opponent.
 *
 * Handles all streets: preflop (0 board cards), flop (3), turn (4), river (5).
 *
 * @param {{ rank: string, suit: string }[]} holeCards - exactly 2 cards
 * @param {{ rank: string, suit: string }[]} board - 0 to 5 community cards
 * @param {number} [numSimulations=800]
 * @returns {number} equity between 0.0 and 1.0
 */
export function calculateEquity(holeCards, board, numSimulations = 800) {
  // Build the set of known card keys for exclusion.
  const knownKeys = new Set();
  for (const c of holeCards) knownKeys.add(cardKey(c));
  for (const c of board) knownKeys.add(cardKey(c));

  // Build the remaining deck as an array of card objects.
  const remaining = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const key = rank + suit;
      if (!knownKeys.has(key)) {
        remaining.push({ rank, suit });
      }
    }
  }

  const cardsNeeded = 5 - board.length; // community cards still to deal
  let wins = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    shuffle(remaining);

    // Deal missing community cards from the shuffled remaining deck.
    let idx = 0;
    let simBoard;
    if (cardsNeeded > 0) {
      simBoard = board.concat(remaining.slice(0, cardsNeeded));
      idx = cardsNeeded;
    } else {
      simBoard = board;
    }

    // Deal 2 cards for the opponent.
    const oppHole = [remaining[idx], remaining[idx + 1]];

    // Evaluate both hands.
    const myResult = bestHand(holeCards, simBoard);
    const oppResult = bestHand(oppHole, simBoard);

    if (myResult.rank < oppResult.rank) {
      wins += 1.0;
    } else if (myResult.rank === oppResult.rank) {
      wins += 0.5;
    }
  }

  return wins / numSimulations;
}

// ---------------------------------------------------------------------------
// getOuts — estimate drawing outs on flop or turn
// ---------------------------------------------------------------------------

/**
 * Estimate drawing outs.
 *
 * Only meaningful on flop (3 community cards) or turn (4 community cards).
 * Returns all zeros otherwise.
 *
 * @param {{ rank: string, suit: string }[]} holeCards - exactly 2 cards
 * @param {{ rank: string, suit: string }[]} board - community cards
 * @returns {{ flushDraw: number, straightDraw: number, overcards: number, total: number }}
 */
export function getOuts(holeCards, board) {
  const result = { flushDraw: 0, straightDraw: 0, overcards: 0, total: 0 };

  // Only meaningful on flop or turn.
  if (board.length !== 3 && board.length !== 4) {
    return result;
  }

  const allCards = holeCards.concat(board);

  // --- Flush draw ---
  // Count how many cards of each suit we have.
  const suitCounts = { s: 0, h: 0, d: 0, c: 0 };
  for (const c of allCards) suitCounts[c.suit]++;

  for (const suit of SUITS) {
    if (suitCounts[suit] === 4) {
      // 13 cards of that suit minus the 4 we see = 9 possible outs.
      result.flushDraw = 9;
      break;
    }
  }

  // --- Straight draw ---
  // Convert all ranks to numeric indices and deduplicate.
  const rankIndices = [];
  const seen = new Set();
  for (const c of allCards) {
    const v = RANK_VAL[c.rank];
    if (!seen.has(v)) {
      seen.add(v);
      rankIndices.push(v);
    }
  }

  const rankSet = seen; // Set of unique rank values
  let oesd = false;
  let gutshot = false;

  // Check for open-ended straight draw: 4 consecutive ranks with room on both sides.
  for (let start = 0; start <= 9; start++) { // 9 = 12 - 3 (last valid window start for 4-wide)
    let hits = 0;
    for (let j = 0; j < 4; j++) {
      if (rankSet.has(start + j)) hits++;
    }
    if (hits === 4) {
      // Open-ended if there is room on both sides (not pinned to edge).
      if (start > 0 && start + 4 < 13) {
        oesd = true;
      } else {
        gutshot = true;
      }
      break;
    }
  }

  // If no OESD found, check for gutshot: 4 of 5 consecutive ranks.
  if (!oesd && !gutshot) {
    for (let start = 0; start <= 8; start++) { // 8 = 12 - 4 (last valid window start for 5-wide)
      let hits = 0;
      for (let j = 0; j < 5; j++) {
        if (rankSet.has(start + j)) hits++;
      }
      if (hits === 4) {
        gutshot = true;
        break;
      }
    }
  }

  if (oesd) {
    result.straightDraw = 8;
  } else if (gutshot) {
    result.straightDraw = 4;
  }

  // --- Overcards ---
  // Count hole cards that rank above the highest board card.
  let highestBoard = -1;
  for (const c of board) {
    const v = RANK_VAL[c.rank];
    if (v > highestBoard) highestBoard = v;
  }

  for (const c of holeCards) {
    if (RANK_VAL[c.rank] > highestBoard) {
      result.overcards += 3; // ~3 outs per overcard
    }
  }

  // --- Total (subtract 2 for flush + straight draw overlap) ---
  let total = result.flushDraw + result.straightDraw + result.overcards;
  if (result.flushDraw > 0 && result.straightDraw > 0) {
    total = Math.max(total - 2, 0);
  }
  result.total = total;

  return result;
}
