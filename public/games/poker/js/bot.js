/**
 * Poker Bot AI Strategy Engine — Pure ES6 module.
 *
 * Ported from Python strategy_engine.py for heads-up play.
 * No external dependencies — imports only from evaluator.js.
 *
 * Exports: PokerBot (class), analyzeBoardTexture (function)
 */

import { bestHand, handPercentile, calculateEquity, getOuts } from './evaluator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rank ordering for hand notation — index = strength (2 lowest, A highest). */
const RANK_ORDER = '23456789TJQKA';

/**
 * Rank character to numeric value for board texture analysis.
 * 2=2, 3=3, ..., T=10, J=11, Q=12, K=13, A=14
 */
const RANK_NUM = Object.freeze({
  '2': 2,  '3': 3,  '4': 4,  '5': 5,  '6': 6,
  '7': 7,  '8': 8,  '9': 9,  'T': 10, 'J': 11,
  'Q': 12, 'K': 13, 'A': 14,
});

// ---------------------------------------------------------------------------
// Hand notation helper (ported from _hand_to_notation)
// ---------------------------------------------------------------------------

/**
 * Convert two hole cards to standard poker notation.
 *
 * Examples: { rank:'A', suit:'s' } + { rank:'K', suit:'s' } -> "AKs"
 *           { rank:'A', suit:'s' } + { rank:'K', suit:'h' } -> "AKo"
 *           { rank:'A', suit:'s' } + { rank:'A', suit:'h' } -> "AA"
 *
 * Higher rank is always listed first.
 *
 * @param {{ rank: string, suit: string }} c1
 * @param {{ rank: string, suit: string }} c2
 * @returns {string}
 */
function handToNotation(c1, c2) {
  const i1 = RANK_ORDER.indexOf(c1.rank);
  const i2 = RANK_ORDER.indexOf(c2.rank);

  // Put higher rank first
  let hi = c1;
  let lo = c2;
  if (i2 > i1) {
    hi = c2;
    lo = c1;
  }

  if (hi.rank === lo.rank) {
    return `${hi.rank}${lo.rank}`;           // Pair: "AA"
  } else if (hi.suit === lo.suit) {
    return `${hi.rank}${lo.rank}s`;           // Suited: "AKs"
  } else {
    return `${hi.rank}${lo.rank}o`;           // Offsuit: "AKo"
  }
}

// ---------------------------------------------------------------------------
// Board texture analysis (ported from _board_texture)
// ---------------------------------------------------------------------------

/**
 * Analyse the community cards to classify the board texture.
 *
 * @param {{ rank: string, suit: string }[]} cards - 3 to 5 community cards
 * @returns {{ paired: boolean, monotone: boolean, flushDraw: boolean,
 *             connected: boolean, high: boolean, dry: boolean, wet: boolean }}
 */
export function analyzeBoardTexture(cards) {
  const result = {
    paired: false,
    monotone: false,
    flushDraw: false,
    connected: false,
    high: false,
    dry: true,
    wet: false,
  };

  if (!cards || cards.length === 0) return result;

  const ranks = cards.map(c => RANK_NUM[c.rank]);
  const suits = cards.map(c => c.suit);

  // Paired: duplicate rank values
  const uniqueRanks = new Set(ranks);
  result.paired = uniqueRanks.size < ranks.length;

  // Suit counts
  const suitCounts = {};
  for (const s of suits) {
    suitCounts[s] = (suitCounts[s] || 0) + 1;
  }
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  result.monotone = maxSuitCount >= 3;
  result.flushDraw = maxSuitCount === 2 && cards.length >= 3;

  // Connectedness: any two distinct ranks within 2 of each other
  const sortedRanks = [...uniqueRanks].sort((a, b) => a - b);
  for (let i = 0; i < sortedRanks.length - 1; i++) {
    if (sortedRanks[i + 1] - sortedRanks[i] <= 2) {
      result.connected = true;
      break;
    }
  }

  // High: max rank >= 10 (T or above)
  result.high = Math.max(...ranks) >= 10;

  // Wet/dry classification
  const wetSignals = (result.monotone ? 1 : 0) +
                     (result.flushDraw ? 1 : 0) +
                     (result.connected ? 1 : 0);
  result.wet = wetSignals >= 2;
  result.dry = !result.wet;

  return result;
}

// ---------------------------------------------------------------------------
// Opponent Tracker — live session stats for adaptive play
// ---------------------------------------------------------------------------

const MIN_SAMPLE = 5; // hands before stats influence decisions

export class OpponentTracker {
  constructor() { this.reset(); }

  reset() {
    this.totalHands = 0;
    // Preflop
    this.vpipHands = 0;       // voluntarily put money in
    this.pfrHands = 0;        // raised preflop
    this.allInPreflop = 0;    // shoved preflop
    this.foldToStealOpp = 0;  // times in BB vs bot SB open
    this.foldToStealCount = 0;
    // Postflop
    this.foldToCbetOpp = 0;   // times facing a flop c-bet
    this.foldToCbetCount = 0;
    this.postflopActions = 0;
    this.postflopAggActions = 0; // bets + raises
    // Per-hand tracking (reset each hand)
    this._handVpip = false;
    this._handPfr = false;
    this._handAllIn = false;
  }

  /** Start tracking a new hand. */
  newHand() {
    this.totalHands++;
    this._handVpip = false;
    this._handPfr = false;
    this._handAllIn = false;
  }

  /**
   * Record an opponent action.
   * @param {string} action - fold|check|call|raise|allIn
   * @param {string} street - preflop|flop|turn|river
   * @param {object} ctx - { botOpenedFromSB, isFacingCbet }
   */
  recordAction(action, street, ctx = {}) {
    if (street === 'preflop') {
      if (action === 'call' || action === 'raise' || action === 'allIn') {
        this._handVpip = true;
      }
      if (action === 'raise') this._handPfr = true;
      if (action === 'allIn') {
        this._handAllIn = true;
        this._handVpip = true;
        this._handPfr = true;
      }
      // Fold to steal: opponent is BB, bot opened from SB
      if (ctx.botOpenedFromSB) {
        this.foldToStealOpp++;
        if (action === 'fold') this.foldToStealCount++;
      }
    } else {
      // Postflop
      this.postflopActions++;
      if (action === 'raise' || action === 'allIn') {
        this.postflopAggActions++;
      }
      // Fold to c-bet
      if (ctx.isFacingCbet && street === 'flop') {
        this.foldToCbetOpp++;
        if (action === 'fold') this.foldToCbetCount++;
      }
    }
  }

  /** Finalize hand-level stats (call at end of each hand). */
  finalizeHand() {
    if (this._handVpip) this.vpipHands++;
    if (this._handPfr) this.pfrHands++;
    if (this._handAllIn) this.allInPreflop++;
  }

  /** Computed stats. Returns neutral 0.5 for ratios with insufficient data. */
  get stats() {
    const n = this.totalHands;
    const safe = (num, den) => den >= MIN_SAMPLE ? num / den : 0.5;
    return {
      vpip:         safe(this.vpipHands, n),
      pfr:          safe(this.pfrHands, n),
      allInFreq:    safe(this.allInPreflop, n),
      foldToSteal:  safe(this.foldToStealCount, this.foldToStealOpp),
      foldToCbet:   safe(this.foldToCbetCount, this.foldToCbetOpp),
      aggression:   safe(this.postflopAggActions, this.postflopActions),
      handsTracked: n,
    };
  }
}

// ---------------------------------------------------------------------------
// PokerBot
// ---------------------------------------------------------------------------

export class PokerBot {
  constructor() {
    /** @type {object|null} Loaded preflop chart data. */
    this.charts = null;
    /** @type {OpponentTracker} Live opponent stats. */
    this.tracker = new OpponentTracker();
  }

  // ── Adaptation Helper ──────────────────────────────────────────────

  /**
   * Shift a threshold based on an opponent stat.
   * Returns the base value unmodified if not enough hands tracked.
   *
   * @param {number} base     - default threshold
   * @param {number} stat     - opponent stat (0-1)
   * @param {number} neutral  - stat value that means "no adjustment" (default 0.5)
   * @param {number} scale    - how aggressively to shift (default 0.15)
   * @returns {number} adjusted threshold
   */
  _adjust(base, stat, neutral = 0.5, scale = 0.15) {
    if (this.tracker.totalHands < MIN_SAMPLE) return base;
    return base - (stat - neutral) * scale;
  }

  /** Get opponent stats (shortcut). */
  get _stats() { return this.tracker.stats; }

  /**
   * Build a short adaptation note for reasoning, or '' if no adaptation.
   * @param {string} label - what's being adjusted (e.g. "c-bet", "call")
   * @param {string} statName - which stat drives it (e.g. "foldToCbet", "aggression")
   * @returns {string}
   */
  _adaptNote(label, statName) {
    if (this.tracker.totalHands < MIN_SAMPLE) return '';
    const s = this._stats;
    const val = s[statName];
    if (val === undefined || val === 0.5) return '';
    const pct = (val * 100).toFixed(0);
    const names = {
      foldToCbet: `opp folds to c-bet ${pct}%`,
      aggression: `opp aggression ${pct}%`,
      allInFreq: `opp shoves ${pct}%`,
      foldToSteal: `opp folds to steal ${pct}%`,
    };
    return ` [${names[statName] ?? statName}]`;
  }

  // ── Chart Loading ──────────────────────────────────────────────────

  /**
   * Fetch and parse the preflop-charts.json data file.
   * Must be called once before the first `decide()` call.
   */
  async loadCharts() {
    const resp = await fetch('./data/preflop-charts.json');
    this.charts = await resp.json();
  }

  // ── Main Entry Point ───────────────────────────────────────────────

  /**
   * Compute a bot decision for the current game state.
   *
   * @param {object} gameState
   * @param {string}   gameState.street           - 'preflop'|'flop'|'turn'|'river'
   * @param {number}   gameState.pot              - total chips in the pot
   * @param {object[]} gameState.communityCards   - [{rank,suit}, ...]
   * @param {object[]} gameState.botCards         - [{rank,suit}, {rank,suit}]
   * @param {number}   gameState.botStack         - bot's remaining stack
   * @param {number}   gameState.opponentStack    - opponent's remaining stack
   * @param {number}   gameState.currentBet       - bet amount bot must call (0 if none)
   * @param {number}   gameState.botCurrentBet    - what bot already put in this street
   * @param {object}   gameState.blindLevel       - { sb, bb }
   * @param {boolean}  gameState.botIsDealer      - true when bot is SB/dealer
   * @param {boolean}  gameState.isPreflopAggressor - did bot raise preflop?
   * @param {number}   gameState.minRaise         - minimum raise increment
   * @param {number}   gameState.maxRaise         - bot's remaining stack
   * @returns {{ action: string, amount: number, reasoning: string }}
   */
  decide(gameState) {
    const {
      street,
      pot,
      communityCards,
      botCards,
      botStack,
      opponentStack,
      currentBet,
      botCurrentBet,
      blindLevel,
      botIsDealer,
      isPreflopAggressor,
      minRaise,
      maxRaise,
    } = gameState;

    const bb = blindLevel.bb;

    let decision;

    if (street === 'preflop') {
      decision = this._preflopDecision(gameState);
    } else {
      decision = this._postflopDecision(gameState);
    }

    // Validate and clamp the decision before returning
    return this._validateAction(decision, gameState);
  }

  // ── Thinking Delay ─────────────────────────────────────────────────

  /**
   * Return a randomised delay in milliseconds to simulate human thinking.
   *
   * @param {string} action - 'fold'|'check'|'call'|'raise'|'allIn'
   * @returns {number} milliseconds
   */
  getThinkingDelay(action) {
    const ranges = {
      fold:  [500, 1200],
      check: [500, 1200],
      call:  [800, 2000],
      raise: [1500, 3500],
      allIn: [1500, 3500],
    };

    const [lo, hi] = ranges[action] || [800, 2000];
    return lo + Math.random() * (hi - lo);
  }

  // ====================================================================
  //  PREFLOP LOGIC (ported from Python strategy_engine.py)
  // ====================================================================

  /**
   * Preflop decision using chart lookups.
   * Handles push/fold, open-raise, defend-BB, 3-bet, and facing all-in.
   *
   * @param {object} gs - full gameState
   * @returns {{ action: string, amount: number, reasoning: string }}
   */
  _preflopDecision(gs) {
    const {
      botCards, botStack, opponentStack,
      currentBet, botCurrentBet, blindLevel,
      botIsDealer, minRaise, maxRaise,
    } = gs;
    const bb = blindLevel.bb;
    const hand = handToNotation(botCards[0], botCards[1]);
    // Use total chips (stack + committed) for effective stack depth.
    // botStack/opponentStack are remaining stacks; totalChips include bets already in.
    const botTotal = gs.botTotalChips ?? (botStack + botCurrentBet);
    const oppTotal = gs.opponentTotalChips ?? (opponentStack + currentBet);
    const effectiveBB = Math.min(botTotal, oppTotal) / bb;
    const amountToCall = currentBet - botCurrentBet;

    // ── 1. Push-fold mode (effective stack <= 20 BB) ──

    if (effectiveBB <= 20) {
      return this._pushFoldDecision(hand, gs, effectiveBB, amountToCall);
    }

    // ── 2. Normal stacks (> 20 BB) ──

    // Bot is SB (dealer, acts first preflop)
    if (botIsDealer) {
      return this._sbDecision(hand, gs, amountToCall);
    }

    // Bot is BB
    return this._bbDecision(hand, gs, amountToCall);
  }

  // ── Push-Fold ──────────────────────────────────────────────────────

  /**
   * Short-stack push/fold strategy.
   *
   * @param {string}  hand         - hand notation (e.g. "AKs")
   * @param {object}  gs           - gameState
   * @param {number}  effectiveBB  - effective stack in big blinds
   * @param {number}  amountToCall - chips to call
   * @returns {{ action: string, amount: number, reasoning: string }}
   */
  _pushFoldDecision(hand, gs, effectiveBB, amountToCall) {
    const { botIsDealer, botStack, opponentStack, currentBet, botCurrentBet, blindLevel } = gs;
    const bb = blindLevel.bb;

    // Select chart bracket
    let bracket;
    if (effectiveBB <= 5)       bracket = '5bb';
    else if (effectiveBB <= 10) bracket = '10bb';
    else if (effectiveBB <= 15) bracket = '15bb';
    else                        bracket = '20bb';

    // Bot is SB: push or fold
    if (botIsDealer) {
      const pushRange = this.charts?.push_fold?.[bracket]?.SB ?? [];
      if (pushRange.includes(hand)) {
        return {
          action: 'allIn',
          amount: botStack,
          reasoning: `Push ${hand} from SB at ${Math.max(1, Math.round(effectiveBB))}bb (${bracket} range)`,
        };
      }
      return {
        action: 'fold',
        amount: 0,
        reasoning: `Fold ${hand} from SB at ${Math.max(1, Math.round(effectiveBB))}bb (not in ${bracket} push range)`,
      };
    }

    // Bot is BB facing all-in from SB
    const opponentIsAllIn = opponentStack === 0 || (currentBet >= opponentStack + botCurrentBet);
    if (opponentIsAllIn) {
      return this._facingAllinDecision(hand, effectiveBB, amountToCall);
    }

    // Bot is BB facing a raise (not all-in) at short stacks:
    // Use defend_bb chart or push over the top with strong hands
    const pushOverRange = this.charts?.push_fold?.[bracket]?.SB ?? [];
    const defendRaise = this.charts?.defend_bb?.vs_SB?.raise ?? [];
    const defendCall = this.charts?.defend_bb?.vs_SB?.call ?? [];

    if (defendRaise.includes(hand)) {
      // Re-shove over the raise with 3-bet value hands at short stacks
      return {
        action: 'allIn',
        amount: botStack,
        reasoning: `Push over SB raise with ${hand} from BB at ${Math.max(1, Math.round(effectiveBB))}bb`,
      };
    }
    if (defendCall.includes(hand)) {
      return {
        action: 'call',
        amount: amountToCall,
        reasoning: `Call SB raise with ${hand} from BB at ${Math.max(1, Math.round(effectiveBB))}bb`,
      };
    }
    return {
      action: 'fold',
      amount: 0,
      reasoning: `Fold ${hand} from BB vs SB raise at ${Math.max(1, Math.round(effectiveBB))}bb`,
    };
  }

  // ── SB Decisions (normal stacks) ───────────────────────────────────

  /**
   * Bot is SB (dealer). Acts first preflop in heads-up.
   *
   * @param {string} hand         - hand notation
   * @param {object} gs           - gameState
   * @param {number} amountToCall - chips to call
   * @returns {{ action: string, amount: number, reasoning: string }}
   */
  _sbDecision(hand, gs, amountToCall) {
    const { currentBet, botCurrentBet, blindLevel, botStack } = gs;
    const bb = blindLevel.bb;

    // Facing a 3-bet from BB (SB opened, BB re-raised)
    if (currentBet > bb * 2 && botCurrentBet > 0) {
      return this._facing3betDecision(hand, gs, amountToCall);
    }

    // Facing an all-in from BB
    const opponentIsAllIn = gs.opponentStack === 0;
    if (opponentIsAllIn && amountToCall > 0) {
      const botTotal = gs.botTotalChips ?? (botStack + botCurrentBet);
      const oppTotal = gs.opponentTotalChips ?? (gs.opponentStack + currentBet);
      const effBB = Math.min(botTotal, oppTotal) / bb;
      return this._facingAllinDecision(hand, effBB, amountToCall);
    }

    // Standard open: no bet beyond BB (or SB has posted and faces BB)
    const openRange = this.charts?.open_raise?.SB ?? [];
    if (openRange.includes(hand)) {
      const raiseAmount = bb * 3; // 3x open from SB in HU
      return {
        action: 'raise',
        amount: raiseAmount,
        reasoning: `Open raise ${hand} to 3x from SB (in range)`,
      };
    }

    return {
      action: 'fold',
      amount: 0,
      reasoning: `Fold ${hand} from SB (not in open range)`,
    };
  }

  // ── BB Decisions (normal stacks) ───────────────────────────────────

  /**
   * Bot is BB. Acts second preflop in heads-up.
   *
   * @param {string} hand         - hand notation
   * @param {object} gs           - gameState
   * @param {number} amountToCall - chips to call
   * @returns {{ action: string, amount: number, reasoning: string }}
   */
  _bbDecision(hand, gs, amountToCall) {
    const { currentBet, blindLevel, botStack, opponentStack } = gs;
    const bb = blindLevel.bb;

    // Facing an all-in from SB
    const opponentIsAllIn = opponentStack === 0;
    if (opponentIsAllIn && amountToCall > 0) {
      const botTotal = gs.botTotalChips ?? (botStack + gs.botCurrentBet);
      const oppTotal = gs.opponentTotalChips ?? (opponentStack + currentBet);
      const effBB = Math.min(botTotal, oppTotal) / bb;
      return this._facingAllinDecision(hand, effBB, amountToCall);
    }

    // SB just completed / limped (currentBet == BB)
    if (currentBet <= bb) {
      // Check from BB by default. Raise with strong holdings.
      const raiseHands = this.charts?.three_bet?.vs_SB?.value ?? [];
      if (raiseHands.includes(hand)) {
        const raiseAmount = bb * 3;
        return {
          action: 'raise',
          amount: raiseAmount,
          reasoning: `Raise ${hand} from BB vs SB limp (strong hand)`,
        };
      }
      return {
        action: 'check',
        amount: 0,
        reasoning: `Check ${hand} from BB (SB limped)`,
      };
    }

    // SB raised — use defend_bb chart
    const defendRaise = this.charts?.defend_bb?.vs_SB?.raise ?? [];
    const defendCall  = this.charts?.defend_bb?.vs_SB?.call ?? [];

    if (defendRaise.includes(hand)) {
      const raiseAmount = currentBet * 3; // 3-bet to 3x the open
      return {
        action: 'raise',
        amount: raiseAmount,
        reasoning: `3-bet ${hand} from BB vs SB open`,
      };
    }
    if (defendCall.includes(hand)) {
      return {
        action: 'call',
        amount: amountToCall,
        reasoning: `Call ${hand} from BB vs SB open (defend range)`,
      };
    }

    return {
      action: 'fold',
      amount: 0,
      reasoning: `Fold ${hand} from BB vs SB open (not in defend range)`,
    };
  }

  // ── Facing 3-bet (SB opened, BB re-raised) ────────────────────────

  /**
   * SB faces a 3-bet from BB.
   * Premium hands 4-bet all-in; some strong hands call; rest fold.
   *
   * @param {string} hand         - hand notation
   * @param {object} gs           - gameState
   * @param {number} amountToCall - chips to call
   * @returns {{ action: string, amount: number, reasoning: string }}
   */
  _facing3betDecision(hand, gs, amountToCall) {
    const { botStack, currentBet, blindLevel } = gs;
    const bb = blindLevel.bb;

    // 4-bet shove hands
    const fourBetShove = ['AA', 'KK', 'QQ', 'AKs', 'AKo'];
    if (fourBetShove.includes(hand)) {
      return {
        action: 'allIn',
        amount: botStack,
        reasoning: `4-bet all-in with ${hand} vs BB 3-bet`,
      };
    }

    // Flat-call if the 3-bet is < 30% of stack
    const fourBetCall = ['JJ', 'TT', 'AQs'];
    if (fourBetCall.includes(hand) && amountToCall < botStack * 0.30) {
      return {
        action: 'call',
        amount: amountToCall,
        reasoning: `Call ${hand} vs BB 3-bet (< 30% of stack)`,
      };
    }

    return {
      action: 'fold',
      amount: 0,
      reasoning: `Fold ${hand} vs BB 3-bet (not premium enough)`,
    };
  }

  // ── Facing All-In ──────────────────────────────────────────────────

  /**
   * Facing an all-in at any preflop stage. Use facing_allin chart.
   *
   * @param {string} hand         - hand notation
   * @param {number} effectiveBB  - effective stack depth in BBs
   * @param {number} amountToCall - chips to call
   * @returns {{ action: string, amount: number, reasoning: string }}
   */
  _facingAllinDecision(hand, effectiveBB, amountToCall) {
    let bracket;
    if (effectiveBB <= 12)      bracket = '10bb';
    else if (effectiveBB <= 17) bracket = '15bb';
    else if (effectiveBB <= 25) bracket = '20bb';
    else                        bracket = 'deep';

    // Widen calling range by one bracket if opponent shoves frequently
    const stats = this._stats;
    let adapted = '';
    if (stats.allInFreq > 0.3 && this.tracker.totalHands >= MIN_SAMPLE) {
      const wider = { deep: '20bb', '20bb': '15bb', '15bb': '10bb', '10bb': '10bb' };
      bracket = wider[bracket] ?? bracket;
      adapted = ' [adjusted: opponent shoves often]';
    }

    const bbDisplay = Math.max(1, Math.round(effectiveBB));
    const callRange = this.charts?.facing_allin?.[bracket] ?? [];
    if (callRange.includes(hand)) {
      return {
        action: 'call',
        amount: amountToCall,
        reasoning: `Call all-in with ${hand} (${bracket} bracket, ${bbDisplay}bb effective)${adapted}`,
      };
    }
    return {
      action: 'fold',
      amount: 0,
      reasoning: `Fold ${hand} vs all-in (${bracket} bracket, ${bbDisplay}bb effective)${adapted}`,
    };
  }

  // ====================================================================
  //  POSTFLOP LOGIC (ported from Python strategy_engine.py)
  // ====================================================================

  /**
   * Postflop decision engine with c-bet, probe, check-raise, and river logic.
   *
   * @param {object} gs - full gameState
   * @returns {{ action: string, amount: number, reasoning: string }}
   */
  _postflopDecision(gs) {
    const {
      street,
      pot,
      communityCards,
      botCards,
      botStack,
      currentBet,
      botCurrentBet,
      blindLevel,
      botIsDealer,
      isPreflopAggressor,
    } = gs;

    const bb = blindLevel.bb;

    // Evaluate hand strength and equity
    const { rank } = bestHand(botCards, communityCards);
    const strength = handPercentile(rank);   // 0-1, higher = better
    const equity = calculateEquity(botCards, communityCards, 800);
    const board = analyzeBoardTexture(communityCards);

    // In HU: SB (dealer) acts FIRST postflop, so SB is OOP.
    // BB is IN position postflop.
    const isIP = !botIsDealer;

    // Effective pot for bet sizing (must be at least 1 BB so sizing math works)
    const effectivePot = Math.max(pot, bb);

    const amountToCall = currentBet - botCurrentBet;

    // ── Facing a bet ──
    if (amountToCall > 0) {
      const potOdds = amountToCall / (effectivePot + amountToCall);
      return this._facingBetDecision(
        gs, strength, equity, potOdds, effectivePot, board, isIP, amountToCall
      );
    }

    // ── No bet to face (checked to bot) ──
    return this._bettingDecision(gs, strength, equity, effectivePot, board, isIP);
  }

  // ── Facing a Bet (ported from _facing_bet_decision) ────────────────

  /**
   * Decision when facing a postflop bet.
   * Includes check-raise logic, river calling thresholds, and pot-odds calls.
   */
  _facingBetDecision(gs, strength, equity, potOdds, pot, board, isIP, amountToCall) {
    const { street, currentBet, botCurrentBet, botStack, blindLevel } = gs;
    const bb = blindLevel.bb;
    const bet = amountToCall;

    // ── Check-raise with monsters (top 3% hands) on flop/turn ──
    if (strength > 0.97 && (street === 'flop' || street === 'turn')) {
      const raiseAmt = Math.max(pot * 0.80 + bet, bet * 2.5);
      return {
        action: 'raise',
        amount: currentBet + Math.round(raiseAmt),
        reasoning: `Check-raise monster (top ${((1 - strength) * 100).toFixed(0)}% hand)`,
      };
    }

    // ── Check-raise semi-bluff on wet flop ──
    if (street === 'flop' && board.wet &&
        equity >= 0.30 && equity <= 0.45 && strength < 0.40) {
      const raiseAmt = Math.max(pot * 0.75 + bet, bet * 2.5);
      return {
        action: 'raise',
        amount: currentBet + Math.round(raiseAmt),
        reasoning: `Check-raise semi-bluff on wet flop (equity ${(equity * 100).toFixed(0)}%)`,
      };
    }

    // ── Monster hand (top 5%) — raise for value ──
    if (strength > 0.95) {
      const raiseAmt = Math.max(pot * 0.75 + bet, bet * 2.5);
      return {
        action: 'raise',
        amount: currentBet + Math.round(raiseAmt),
        reasoning: `Raise with monster (top ${((1 - strength) * 100).toFixed(0)}% hand)`,
      };
    }

    // ── River-specific: tighter calling thresholds ──
    // Adapt: call lighter vs aggressive opponents (they bluff more)
    const agg = this._stats.aggression;
    const aggNote = this._adaptNote('call', 'aggression');
    const riverCallThresh = this._adjust(0.70, agg, 0.4, 0.15);
    const riverFoldThresh = this._adjust(0.50, agg, 0.4, -0.10);
    if (street === 'river') {
      // Strong hand — call
      if (strength > riverCallThresh && equity > potOdds) {
        return {
          action: 'call',
          amount: amountToCall,
          reasoning: `River call with strong hand (${(strength * 100).toFixed(0)}% strength)${aggNote}`,
        };
      }
      // Weak — fold
      if (strength < riverFoldThresh) {
        return {
          action: 'fold',
          amount: 0,
          reasoning: `River fold — hand too weak (${(strength * 100).toFixed(0)}%) to call${aggNote}`,
        };
      }
      // Showdown value vs reasonable bet
      if (strength >= 0.60 && equity > potOdds) {
        return {
          action: 'call',
          amount: amountToCall,
          reasoning: `River call — showdown value (${(strength * 100).toFixed(0)}%, odds justify)`,
        };
      }
      // Small bet + pot odds
      if (bet <= pot * 0.5 && equity > potOdds) {
        return {
          action: 'call',
          amount: amountToCall,
          reasoning: `River call small bet (${(strength * 100).toFixed(0)}%, equity ${(equity * 100).toFixed(0)}% > odds ${(potOdds * 100).toFixed(0)}%)`,
        };
      }
      // Marginal — fold vs large bet
      return {
        action: 'fold',
        amount: 0,
        reasoning: `River fold — marginal hand vs large bet (${(strength * 100).toFixed(0)}%)`,
      };
    }

    // ── Strong hand (top 20%) with good equity — call ──
    // Adapt: call lighter vs aggressive opponents
    const strongCallThresh = this._adjust(0.80, agg, 0.4, 0.15);
    if (strength > strongCallThresh && equity > potOdds) {
      return {
        action: 'call',
        amount: amountToCall,
        reasoning: `Call with strong hand (equity ${(equity * 100).toFixed(0)}% > pot odds ${(potOdds * 100).toFixed(0)}%)${aggNote}`,
      };
    }

    // ── Drawing hand — call if pot odds justify it ──
    if (equity > potOdds && equity > 0.25) {
      return {
        action: 'call',
        amount: amountToCall,
        reasoning: `Call drawing hand (equity ${(equity * 100).toFixed(0)}% > pot odds ${(potOdds * 100).toFixed(0)}%)`,
      };
    }

    // ── Weak hand, bad equity — clear fold ──
    // Adapt: fold less vs aggressive opponents (they might be bluffing)
    const weakFoldThresh = this._adjust(0.30, agg, 0.4, -0.10);
    if (strength < weakFoldThresh && equity < potOdds) {
      return {
        action: 'fold',
        amount: 0,
        reasoning: `Fold weak hand (equity ${(equity * 100).toFixed(0)}% < pot odds ${(potOdds * 100).toFixed(0)}%)${aggNote}`,
      };
    }

    // ── Marginal: equity close to pot odds — position-dependent ──
    if (Math.abs(equity - potOdds) < 0.08) {
      if (isIP) {
        return {
          action: 'call',
          amount: amountToCall,
          reasoning: `Marginal call IP (equity ${(equity * 100).toFixed(0)}% ~ pot odds ${(potOdds * 100).toFixed(0)}%)`,
        };
      }
      return {
        action: 'fold',
        amount: 0,
        reasoning: `Marginal fold OOP (equity ${(equity * 100).toFixed(0)}% ~ pot odds ${(potOdds * 100).toFixed(0)}%)`,
      };
    }

    // Equity beats pot odds — call
    if (equity > potOdds) {
      return {
        action: 'call',
        amount: amountToCall,
        reasoning: `Call — equity ${(equity * 100).toFixed(0)}% > pot odds ${(potOdds * 100).toFixed(0)}%`,
      };
    }

    // Default: fold
    return {
      action: 'fold',
      amount: 0,
      reasoning: `Fold — equity ${(equity * 100).toFixed(0)}% doesn't justify call`,
    };
  }

  // ── Betting Decision (checked to bot) ──────────────────────────────

  /**
   * Decision when checked to the bot — decide whether and how much to bet.
   * Dispatches to street-specific sub-methods.
   */
  _bettingDecision(gs, strength, equity, pot, board, isIP) {
    const { street, blindLevel, isPreflopAggressor } = gs;
    const bb = blindLevel.bb;

    // Flop: c-bet as preflop aggressor
    if (street === 'flop' && isPreflopAggressor) {
      return this._cbetDecision(gs, strength, equity, pot, board, isIP);
    }

    // Turn: probe bet / delayed c-bet
    if (street === 'turn') {
      return this._turnBetDecision(gs, strength, equity, pot, board, isIP);
    }

    // River: value bet or bluff
    if (street === 'river') {
      return this._riverBetDecision(gs, strength, equity, pot, board);
    }

    // Generic fallback (e.g. flop as non-aggressor)
    return this._genericBetDecision(strength, equity, pot, board, isIP, bb);
  }

  // ── C-bet (ported from _cbet_decision) ─────────────────────────────

  /**
   * Continuation bet on the flop as preflop aggressor.
   */
  _cbetDecision(gs, strength, equity, pot, board, isIP) {
    const bb = gs.blindLevel.bb;

    // Value c-bet: good hand or strong equity
    // Adapt: lower threshold if opponent folds to c-bets often
    const cbetNote = this._adaptNote('c-bet', 'foldToCbet');
    const cbetThresh = this._adjust(0.55, this._stats.foldToCbet, 0.5, 0.2);
    if (strength > cbetThresh || equity > 0.60) {
      let betSize, note;
      if (board.dry) {
        betSize = Math.max(Math.round(pot * 0.33), bb);
        note = '1/3 pot on dry board';
      } else {
        betSize = Math.max(Math.round(pot * 0.67), bb);
        note = '2/3 pot on wet board';
      }
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `C-bet for value (${note}, equity ${(equity * 100).toFixed(0)}%)${cbetNote}`,
      };
    }

    // Bluff c-bet: dry + high board, weak hand, preferably IP
    // Adapt: bluff more liberally if opponent folds to c-bets
    const bluffCap = this._adjust(0.40, this._stats.foldToCbet, 0.5, 0.2);
    if (board.dry && board.high && strength < bluffCap) {
      if (isIP || equity > 0.25) {
        const betSize = Math.max(Math.round(pot * 0.33), bb);
        return {
          action: 'raise',
          amount: betSize,
          reasoning: `C-bet bluff on dry high board (IP=${isIP}, equity ${(equity * 100).toFixed(0)}%)${cbetNote}`,
        };
      }
    }

    // Semi-bluff c-bet: draw with 25-50% equity
    if (equity >= 0.25 && equity <= 0.50 && strength < 0.50) {
      if (isIP || equity >= 0.40) {
        const sizing = isIP ? 0.50 : 0.33;
        const betSize = Math.max(Math.round(pot * sizing), bb);
        return {
          action: 'raise',
          amount: betSize,
          reasoning: `C-bet semi-bluff (equity ${(equity * 100).toFixed(0)}%, IP=${isIP})`,
        };
      }
    }

    // Give up: weak hand on bad board
    if (strength < 0.30 && equity < 0.25) {
      return {
        action: 'check',
        amount: 0,
        reasoning: 'Give up c-bet — weak hand on bad board',
      };
    }

    // Marginal: dry board -> small c-bet; wet board -> check
    if (board.dry) {
      const betSize = Math.max(Math.round(pot * 0.33), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `Marginal c-bet on dry board (strength ${(strength * 100).toFixed(0)}%)`,
      };
    }

    return {
      action: 'check',
      amount: 0,
      reasoning: `Check back marginal hand on wet board (${(strength * 100).toFixed(0)}%)`,
    };
  }

  // ── Turn Bet (ported from _turn_bet_decision) ──────────────────────

  /**
   * Turn betting: delayed c-bet, probe bet, or semi-bluff.
   */
  _turnBetDecision(gs, strength, equity, pot, board, isIP) {
    const bb = gs.blindLevel.bb;

    // Strong hand — value bet
    if (strength > 0.70 || equity > 0.65) {
      const betSize = Math.max(Math.round(pot * 0.66), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `Turn value bet (strength ${(strength * 100).toFixed(0)}%, equity ${(equity * 100).toFixed(0)}%)`,
      };
    }

    // Probe bet IP: opponent showed weakness with moderate equity
    if (isIP && equity >= 0.35 && equity <= 0.65 && strength > 0.30) {
      const betSize = Math.max(Math.round(pot * 0.50), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `Probe bet IP — opponent showed weakness (equity ${(equity * 100).toFixed(0)}%)`,
      };
    }

    // Delayed c-bet: preflop aggressor who checked flop
    if (gs.isPreflopAggressor && strength > 0.40) {
      const betSize = Math.max(Math.round(pot * 0.50), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `Delayed c-bet on turn (strength ${(strength * 100).toFixed(0)}%)`,
      };
    }

    // Semi-bluff with draws IP
    if (equity >= 0.25 && equity <= 0.45 && strength < 0.40 && isIP) {
      const betSize = Math.max(Math.round(pot * 0.50), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `Turn semi-bluff IP (equity ${(equity * 100).toFixed(0)}%)`,
      };
    }

    // Weak — check
    if (strength < 0.25 && equity < 0.25) {
      return {
        action: 'check',
        amount: 0,
        reasoning: 'Check weak hand on turn',
      };
    }

    // Marginal: small probe IP, check OOP
    if (isIP && strength > 0.30) {
      const betSize = Math.max(Math.round(pot * 0.33), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `Small turn probe IP (${(strength * 100).toFixed(0)}% strength)`,
      };
    }

    return {
      action: 'check',
      amount: 0,
      reasoning: `Check marginal turn hand (${(strength * 100).toFixed(0)}%)`,
    };
  }

  // ── River Bet (ported from _river_bet_decision) ────────────────────

  /**
   * River betting: value bets and occasional bluffs.
   */
  _riverBetDecision(gs, strength, equity, pot, board) {
    const bb = gs.blindLevel.bb;

    // Strong value bet — top 25% hands
    if (strength > 0.75) {
      const betSize = Math.max(Math.round(pot * 0.75), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `River value bet (strength ${(strength * 100).toFixed(0)}%)`,
      };
    }

    // Thin value on dry/paired board — top 40%
    if (strength > 0.60 && (board.dry || board.paired)) {
      const betSize = Math.max(Math.round(pot * 0.50), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `Thin river value bet on favorable board (strength ${(strength * 100).toFixed(0)}%)`,
      };
    }

    // River bluff: missed draw, no showdown value, scary board
    if (strength < 0.20 && equity < 0.20) {
      let canBluff = false;

      if (board.monotone) {
        // Check if bot has a card of the dominant suit (can represent flush)
        const suitCounts = {};
        for (const c of gs.communityCards) {
          suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
        }
        let dominantSuit = null;
        let maxCount = 0;
        for (const [suit, count] of Object.entries(suitCounts)) {
          if (count > maxCount) {
            maxCount = count;
            dominantSuit = suit;
          }
        }
        if (gs.botCards.some(c => c.suit === dominantSuit)) {
          canBluff = true;
        }
      } else if (board.connected) {
        canBluff = true;
      }

      if (canBluff) {
        const betSize = Math.max(Math.round(pot * 0.66), bb);
        return {
          action: 'raise',
          amount: betSize,
          reasoning: 'River bluff — missed draw, representing completed hand',
        };
      }
    }

    // Weak / marginal — check
    return {
      action: 'check',
      amount: 0,
      reasoning: `River check — not strong enough to bet (${(strength * 100).toFixed(0)}%)`,
    };
  }

  // ── Generic Fallback ───────────────────────────────────────────────

  /**
   * Generic betting fallback when no specific street logic matches
   * (e.g. flop as non-aggressor).
   */
  _genericBetDecision(strength, equity, pot, board, isIP, bb) {
    // Strong hand — value bet 2/3 pot
    if (equity > 0.70 || strength > 0.75) {
      const betSize = Math.max(Math.round(pot * 0.66), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `Value bet (equity ${(equity * 100).toFixed(0)}%, strength ${(strength * 100).toFixed(0)}%)`,
      };
    }

    // Weak — check
    if (strength < 0.20 && equity < 0.30) {
      return {
        action: 'check',
        amount: 0,
        reasoning: 'Check weak hand, no equity to bet',
      };
    }

    // Moderate IP — small bet 1/3 pot
    if (isIP && strength > 0.40) {
      const betSize = Math.max(Math.round(pot * 0.33), bb);
      return {
        action: 'raise',
        amount: betSize,
        reasoning: `Small bet IP with moderate hand (${(strength * 100).toFixed(0)}%)`,
      };
    }

    // Moderate OOP — check
    return {
      action: 'check',
      amount: 0,
      reasoning: `Check moderate hand (${(strength * 100).toFixed(0)}%)`,
    };
  }

  // ====================================================================
  //  ACTION VALIDATION
  // ====================================================================

  /**
   * Validate and clamp the raw decision to legal game actions.
   *
   * Enforces min/max raise, converts impossible actions, and ensures
   * bet amounts are at least 1 BB.
   *
   * @param {{ action: string, amount: number, reasoning: string }} decision
   * @param {object} gs - gameState
   * @returns {{ action: string, amount: number, reasoning: string }}
   */
  _validateAction(decision, gs) {
    let { action, amount, reasoning } = decision;
    const {
      currentBet, botCurrentBet, botStack, blindLevel, minRaise, maxRaise,
    } = gs;
    const bb = blindLevel.bb;
    const amountToCall = currentBet - botCurrentBet;

    // If action is 'check' but there is a bet to face, convert to fold
    if (action === 'check' && amountToCall > 0) {
      action = 'fold';
      amount = 0;
      reasoning += ' [adjusted: cannot check facing bet, folding]';
    }

    // If action is 'call' and amount exceeds stack, convert to allIn
    if (action === 'call' && amountToCall > botStack) {
      action = 'allIn';
      amount = botStack;
      reasoning += ' [adjusted: call exceeds stack, going all-in]';
    }

    // For raise actions, 'amount' represents the total raise-to size.
    // The engine's performAction expects a raise-to value.
    if (action === 'raise') {
      // Ensure raise amount is at least 1 BB
      if (amount < bb) {
        amount = bb;
      }

      // For postflop bets (where currentBet is 0 and bot is initiating),
      // the "amount" from decision logic is already the bet size.
      // For preflop raises, "amount" is typically the raise-to total.
      // We need to ensure the raise-to is >= currentBet + minRaise.
      const minRaiseTotal = currentBet + minRaise;

      if (amount < minRaiseTotal) {
        amount = minRaiseTotal;
      }

      // If raise amount exceeds stack, convert to allIn
      const chipsNeeded = amount - botCurrentBet;
      if (chipsNeeded >= botStack) {
        action = 'allIn';
        amount = botStack;
        reasoning += ' [adjusted: raise exceeds stack, going all-in]';
      }
    }

    // AllIn amount is always the full remaining stack
    if (action === 'allIn') {
      amount = botStack;
    }

    // Fold amount is always 0
    if (action === 'fold') {
      amount = 0;
    }

    return { action, amount, reasoning };
  }
}
