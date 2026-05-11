// ============================================================================
// Heads-Up Texas Hold'em Poker Engine
// Pure ES6 module -- no external dependencies
// ============================================================================

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

const BLIND_LEVELS = [
  { sb: 1,  bb: 2  },
  { sb: 2,  bb: 4  },
  { sb: 3,  bb: 6  },
  { sb: 5,  bb: 10 },
  { sb: 8,  bb: 16 },
  { sb: 12, bb: 24 },
  { sb: 20, bb: 40 },
];

const BLIND_ESCALATION_MS = 2 * 60 * 1000; // 2 minutes per level

const STREETS = ['preflop', 'flop', 'turn', 'river'];

// ============================================================================
// Deck
// ============================================================================

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle (in-place, returns the array). */
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ============================================================================
// Deep-copy helper (structuredClone where available, fallback to JSON)
// ============================================================================

function deepCopy(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

// ============================================================================
// Opponent helper
// ============================================================================

function opponent(player) {
  return player === 'human' ? 'bot' : 'human';
}

// ============================================================================
// PokerEngine
// ============================================================================

export class PokerEngine {
  /**
   * @param {Object} options
   * @param {number}   options.startingStack  - chips each player begins with (default 200)
   * @param {Function} options.evaluateHands  - (hands, communityCards) => { winner, handName }
   *   hands: { human: [card, card], bot: [card, card] }
   *   communityCards: [card, ...]
   *   Must return: { winner: 'human'|'bot'|'tie', humanHandName?, botHandName? }
   */
  constructor(options = {}) {
    this._startingStack = options.startingStack ?? 200;
    this._evaluateHands = options.evaluateHands ?? null;

    // Callbacks
    this._onStateChange = null;
    this._onHandComplete = null;
    this._onGameOver = null;
    this._onBlindsUp = null;

    // Blind timer internals
    this._blindTimerId = null;
    this._blindLevelIndex = 0;
    this._blindTimerStart = null;  // Date.now() when current level timer started
    this._blindTimerElapsed = 0;   // accumulated ms before a pause

    // Stats
    this._stats = { handsPlayed: 0, biggestPot: 0 };

    // Internal deck and state
    this._deck = [];
    this._deckIndex = 0;
    this._state = this._emptyState();
  }

  // --------------------------------------------------------------------------
  // Public API -- State
  // --------------------------------------------------------------------------

  /** Returns a sanitised deep copy of game state (bot hole cards hidden until showdown). */
  getState() {
    const copy = deepCopy(this._state);

    // Hide bot's hole cards unless showdown or hand is over with showdown flag
    if (!this._state.showdown) {
      if (copy.players.bot.holeCards.length > 0) {
        copy.players.bot.holeCards = [null, null];
      }
    }

    // Attach stats
    copy.stats = deepCopy(this._stats);

    return copy;
  }

  /** Returns the raw internal state -- includes bot hole cards. For bot AI use only. */
  _getInternalState() {
    return deepCopy(this._state);
  }

  // --------------------------------------------------------------------------
  // Public API -- Game Flow
  // --------------------------------------------------------------------------

  /** Initialise stacks, choose first dealer, start blind timer. */
  startGame() {
    this._blindLevelIndex = 0;
    this._stats = { handsPlayed: 0, biggestPot: 0 };

    this._state = this._emptyState();
    this._state.players.human.stack = this._startingStack;
    this._state.players.bot.stack = this._startingStack;
    this._state.blindLevel = { ...BLIND_LEVELS[0] };

    // First hand: human is dealer (SB)
    this._state.players.human.isDealer = true;
    this._state.players.bot.isDealer = false;

    this._state.gameOver = false;

    this.startBlindTimer();
    this._emitStateChange();
  }

  /** Shuffle, deal hole cards, post blinds, set acting player. */
  startHand() {
    if (this._state.gameOver) return;

    const s = this._state;

    // Reset hand-level state
    s.street = 'preflop';
    s.pot = 0;
    s.communityCards = [];
    s.currentBet = 0;
    s.minRaise = s.blindLevel.bb;
    s.handOver = false;
    s.winner = null;
    s.showdown = false;
    s.preflopAggressor = null;
    s.actingPlayer = null;
    s.handNumber += 1;

    // Reset player hand-level state
    for (const id of ['human', 'bot']) {
      s.players[id].holeCards = [];
      s.players[id].folded = false;
      s.players[id].currentBet = 0;
    }

    // Internal per-street tracking
    this._streetActCount = { human: 0, bot: 0 };

    // Shuffle deck
    this._deck = shuffle(createDeck());
    this._deckIndex = 0;

    // Post blinds
    this._postBlinds();

    // Deal hole cards (2 each, alternating starting with SB/dealer)
    const dealer = this._dealer();
    const bb = opponent(dealer);
    for (let i = 0; i < 2; i++) {
      s.players[dealer].holeCards.push(this._drawCard());
      s.players[bb].holeCards.push(this._drawCard());
    }

    // Check if both players are all-in after posting blinds
    if (s.players.human.stack === 0 && s.players.bot.stack === 0) {
      this._returnExcessBet();
      this._dealRemainingStreets();
      this._endHand(null, true);
      return;
    }

    // If the SB (dealer) is all-in after posting, BB gets to act
    // If BB is all-in after posting, SB still acts first (can call/fold/raise)
    if (s.players[dealer].stack === 0) {
      // SB all-in from blinds -- BB gets the option
      s.actingPlayer = bb;
    } else {
      // Normal: SB (dealer) acts first preflop
      s.actingPlayer = dealer;
    }

    this._emitStateChange();
  }

  // --------------------------------------------------------------------------
  // Public API -- Player Actions
  // --------------------------------------------------------------------------

  /**
   * Perform a player action.
   * @param {'human'|'bot'} player
   * @param {'fold'|'check'|'call'|'raise'|'allIn'} action
   * @param {number} [amount] - required for 'raise' (the raise-TO amount)
   * @returns {{ valid: boolean, error?: string }}
   */
  performAction(player, action, amount) {
    const s = this._state;

    // Basic guards
    if (s.handOver || s.gameOver) {
      return { valid: false, error: 'Hand or game is already over.' };
    }
    if (s.actingPlayer !== player) {
      return { valid: false, error: `It is not ${player}'s turn to act.` };
    }

    const p = s.players[player];
    const opp = s.players[opponent(player)];

    let result;
    switch (action) {
      case 'fold':
        result = this._actionFold(player, p, opp);
        break;
      case 'check':
        result = this._actionCheck(player, p, opp);
        break;
      case 'call':
        result = this._actionCall(player, p, opp);
        break;
      case 'raise':
        result = this._actionRaise(player, p, opp, amount);
        break;
      case 'allIn':
        result = this._actionAllIn(player, p, opp);
        break;
      default:
        return { valid: false, error: `Unknown action: ${action}` };
    }

    if (!result.valid) return result;

    this._emitStateChange();
    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // Public API -- Blind Timer
  // --------------------------------------------------------------------------

  startBlindTimer() {
    this.stopBlindTimer();
    this._blindTimerStart = Date.now();
    this._blindTimerElapsed = 0;
    this._scheduleBlindEscalation();
  }

  stopBlindTimer() {
    if (this._blindTimerId !== null) {
      clearTimeout(this._blindTimerId);
      this._blindTimerId = null;
    }
    // Accumulate elapsed time so we can resume correctly
    if (this._blindTimerStart !== null) {
      this._blindTimerElapsed += Date.now() - this._blindTimerStart;
      this._blindTimerStart = null;
    }
  }

  /** Returns seconds remaining until next blind level (or 0 if maxed out). */
  getBlindTimeRemaining() {
    if (this._blindLevelIndex >= BLIND_LEVELS.length - 1) return 0;

    let elapsed = this._blindTimerElapsed;
    if (this._blindTimerStart !== null) {
      elapsed += Date.now() - this._blindTimerStart;
    }
    const remaining = Math.max(0, BLIND_ESCALATION_MS - elapsed);
    return Math.ceil(remaining / 1000);
  }

  // --------------------------------------------------------------------------
  // Public API -- Callbacks
  // --------------------------------------------------------------------------

  onStateChange(cb)   { this._onStateChange = cb; }
  onHandComplete(cb)  { this._onHandComplete = cb; }
  onGameOver(cb)      { this._onGameOver = cb; }
  onBlindsUp(cb)      { this._onBlindsUp = cb; }

  // --------------------------------------------------------------------------
  // Internal -- State Helpers
  // --------------------------------------------------------------------------

  _emptyState() {
    return {
      street: 'preflop',
      pot: 0,
      communityCards: [],
      players: {
        human: { stack: 0, currentBet: 0, holeCards: [], folded: false, isDealer: false },
        bot:   { stack: 0, currentBet: 0, holeCards: [], folded: false, isDealer: false },
      },
      blindLevel: { sb: 1, bb: 2 },
      currentBet: 0,
      minRaise: 2,
      handNumber: 0,
      preflopAggressor: null,
      actingPlayer: null,
      handOver: false,
      winner: null,
      gameOver: false,
      showdown: false,
    };
  }

  _dealer() {
    return this._state.players.human.isDealer ? 'human' : 'bot';
  }

  _bigBlindPlayer() {
    return opponent(this._dealer());
  }

  _drawCard() {
    return this._deck[this._deckIndex++];
  }

  // --------------------------------------------------------------------------
  // Internal -- Blind Posting
  // --------------------------------------------------------------------------

  _postBlinds() {
    const s = this._state;
    const dealer = this._dealer();
    const bbPlayer = opponent(dealer);

    const sbAmount = Math.min(s.blindLevel.sb, s.players[dealer].stack);
    const bbAmount = Math.min(s.blindLevel.bb, s.players[bbPlayer].stack);

    // Deduct from stacks
    s.players[dealer].stack -= sbAmount;
    s.players[dealer].currentBet = sbAmount;

    s.players[bbPlayer].stack -= bbAmount;
    s.players[bbPlayer].currentBet = bbAmount;

    s.pot = sbAmount + bbAmount;
    s.currentBet = bbAmount;
    s.minRaise = s.blindLevel.bb; // min raise increment = BB preflop
  }

  // --------------------------------------------------------------------------
  // Internal -- Actions
  // --------------------------------------------------------------------------

  _actionFold(player, p, _opp) {
    p.folded = true;
    this._streetActCount[player]++;
    this._endHand(opponent(player), false);
    return { valid: true };
  }

  _actionCheck(player, p, _opp) {
    const s = this._state;
    const amountToCall = s.currentBet - p.currentBet;

    if (amountToCall > 0) {
      return { valid: false, error: 'Cannot check when there is a bet to call.' };
    }

    this._streetActCount[player]++;
    this._advanceAction(player);
    return { valid: true };
  }

  _actionCall(player, p, opp) {
    const s = this._state;
    const amountToCall = s.currentBet - p.currentBet;

    if (amountToCall <= 0) {
      return { valid: false, error: 'Nothing to call. Use check instead.' };
    }

    const actualCall = Math.min(amountToCall, p.stack);
    p.stack -= actualCall;
    p.currentBet += actualCall;
    s.pot += actualCall;

    this._streetActCount[player]++;
    this._advanceAction(player);
    return { valid: true };
  }

  _actionRaise(player, p, opp, amount) {
    const s = this._state;

    if (amount === undefined || amount === null) {
      return { valid: false, error: 'Raise requires an amount (raise-to total).' };
    }

    // amount is the total bet the player wants to have on this street
    const totalBet = amount;
    const additionalChips = totalBet - p.currentBet;

    if (additionalChips <= 0) {
      return { valid: false, error: 'Raise amount must be greater than current bet.' };
    }

    if (additionalChips > p.stack) {
      return { valid: false, error: 'Not enough chips. Use allIn instead.' };
    }

    // Check minimum raise: total must be >= currentBet + minRaise increment
    const minTotal = s.currentBet + s.minRaise;
    if (totalBet < minTotal && additionalChips < p.stack) {
      // Exception: if the player doesn't have enough for a min raise, they must go all-in
      return { valid: false, error: `Minimum raise is to ${minTotal}. Use allIn if short-stacked.` };
    }

    // Update min raise increment: the raise increment just made
    const raiseIncrement = totalBet - s.currentBet;
    s.minRaise = Math.max(s.minRaise, raiseIncrement);

    p.stack -= additionalChips;
    p.currentBet = totalBet;
    s.pot += additionalChips;
    s.currentBet = totalBet;

    // Track preflop aggressor
    if (s.street === 'preflop') {
      s.preflopAggressor = player;
    }

    this._streetActCount[player]++;
    // Reset opponent's act count so they get another chance to respond
    this._streetActCount[opponent(player)] = 0;

    this._advanceAction(player);
    return { valid: true };
  }

  _actionAllIn(player, p, opp) {
    const s = this._state;

    if (p.stack <= 0) {
      return { valid: false, error: 'Player has no chips to go all-in with.' };
    }

    const allInAmount = p.stack;
    const newBet = p.currentBet + allInAmount;

    // If this is a raise, update min raise
    if (newBet > s.currentBet) {
      const raiseIncrement = newBet - s.currentBet;
      // Only update minRaise if this is a full raise
      if (raiseIncrement >= s.minRaise) {
        s.minRaise = raiseIncrement;
      }
      s.currentBet = newBet;

      if (s.street === 'preflop') {
        s.preflopAggressor = player;
      }

      // Reset opponent act count since this is a raise
      this._streetActCount[opponent(player)] = 0;
    }

    p.stack = 0;
    p.currentBet = newBet;
    s.pot += allInAmount;

    this._streetActCount[player]++;
    this._advanceAction(player);
    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // Internal -- Action Advancement / Street Progression
  // --------------------------------------------------------------------------

  _advanceAction(justActed) {
    const s = this._state;
    const other = opponent(justActed);

    // Check if hand ended (fold already handled separately in _actionFold)
    // Check if betting round is over
    if (this._isBettingRoundOver()) {
      this._endBettingRound();
      return;
    }

    // Otherwise, it's the other player's turn
    s.actingPlayer = other;
  }

  _isBettingRoundOver() {
    const s = this._state;
    const human = s.players.human;
    const bot = s.players.bot;

    // If someone folded, hand is over (handled before this is called)
    if (human.folded || bot.folded) return true;

    // If both players are all-in, no more action possible
    if (human.stack === 0 && bot.stack === 0) return true;

    // If one player is all-in (stack 0), round is over once the other has acted at least once
    if (human.stack === 0 && this._streetActCount.bot > 0) return true;
    if (bot.stack === 0 && this._streetActCount.human > 0) return true;

    // Both players must have acted at least once (normal case)
    if (this._streetActCount.human === 0 || this._streetActCount.bot === 0) {
      return false;
    }

    // Bets must be equal
    return human.currentBet === bot.currentBet;
  }

  /**
   * When one player's all-in is smaller than the other's bet, the excess
   * chips are returned to the bigger-stack player so the pot only contains
   * what both players can match.
   */
  _returnExcessBet() {
    const s = this._state;
    const human = s.players.human;
    const bot = s.players.bot;

    if (human.currentBet !== bot.currentBet) {
      const excess = Math.abs(human.currentBet - bot.currentBet);
      if (human.currentBet > bot.currentBet) {
        human.stack += excess;
        human.currentBet -= excess;
      } else {
        bot.stack += excess;
        bot.currentBet -= excess;
      }
      s.pot -= excess;
    }
  }

  _endBettingRound() {
    const s = this._state;

    // Check if someone is all-in -- if so, deal remaining streets without betting
    const someoneAllIn = s.players.human.stack === 0 || s.players.bot.stack === 0;

    if (someoneAllIn && !s.players.human.folded && !s.players.bot.folded) {
      // Handle unequal all-ins: return excess chips to the bigger-stack player.
      // e.g. Human bets 300, bot can only call 100 → pot should be 200, human gets 200 back.
      this._returnExcessBet();

      // Deal out remaining community cards with no more betting
      this._dealRemainingStreets();
      // Showdown
      this._endHand(null, true);
      return;
    }

    // Advance to next street
    const streetIndex = STREETS.indexOf(s.street);
    if (streetIndex >= STREETS.length - 1) {
      // After river betting, showdown
      this._endHand(null, true);
      return;
    }

    this._advanceStreet();
  }

  _advanceStreet() {
    const s = this._state;
    const nextStreetIndex = STREETS.indexOf(s.street) + 1;
    s.street = STREETS[nextStreetIndex];

    // Reset per-street betting state
    s.players.human.currentBet = 0;
    s.players.bot.currentBet = 0;
    s.currentBet = 0;
    s.minRaise = s.blindLevel.bb;
    this._streetActCount = { human: 0, bot: 0 };

    // Deal community cards
    if (s.street === 'flop') {
      // Burn one, deal three
      this._deckIndex++; // burn
      s.communityCards.push(this._drawCard(), this._drawCard(), this._drawCard());
    } else if (s.street === 'turn' || s.street === 'river') {
      // Burn one, deal one
      this._deckIndex++; // burn
      s.communityCards.push(this._drawCard());
    }

    // Postflop: BB (non-dealer) acts first
    const bbPlayer = this._bigBlindPlayer();
    s.actingPlayer = bbPlayer;
  }

  _dealRemainingStreets() {
    const s = this._state;

    // From current street, deal out any remaining community cards
    while (STREETS.indexOf(s.street) < STREETS.length - 1) {
      const nextIndex = STREETS.indexOf(s.street) + 1;
      s.street = STREETS[nextIndex];

      if (s.street === 'flop') {
        this._deckIndex++; // burn
        s.communityCards.push(this._drawCard(), this._drawCard(), this._drawCard());
      } else if (s.street === 'turn' || s.street === 'river') {
        this._deckIndex++; // burn
        s.communityCards.push(this._drawCard());
      }
    }

    // Reset per-street bet tracking (cosmetic, for final state)
    s.players.human.currentBet = 0;
    s.players.bot.currentBet = 0;
    s.currentBet = 0;
  }

  // --------------------------------------------------------------------------
  // Internal -- Hand Resolution
  // --------------------------------------------------------------------------

  _endHand(winnerByFold, isShowdown) {
    const s = this._state;
    s.handOver = true;
    s.actingPlayer = null;
    s.showdown = isShowdown;

    let winner = null;
    let resultDetail = {};

    if (winnerByFold) {
      // One player folded
      winner = winnerByFold;
      resultDetail = { winner, pot: s.pot, showdown: false };
    } else {
      // Showdown -- use external evaluator
      if (this._evaluateHands) {
        const evalResult = this._evaluateHands(
          { human: s.players.human.holeCards, bot: s.players.bot.holeCards },
          s.communityCards
        );
        winner = evalResult.winner; // 'human' | 'bot' | 'tie'
        resultDetail = {
          winner,
          pot: s.pot,
          showdown: true,
          humanHandName: evalResult.humanHandName ?? null,
          botHandName: evalResult.botHandName ?? null,
        };
      } else {
        // No evaluator provided -- cannot determine winner
        winner = 'tie';
        resultDetail = { winner: 'tie', pot: s.pot, showdown: true };
      }
    }

    s.winner = winner;

    // Award pot
    if (winner === 'tie') {
      const half = Math.floor(s.pot / 2);
      const remainder = s.pot - half * 2;
      s.players.human.stack += half;
      s.players.bot.stack += half;
      // Odd chip goes to the player out of position (BB / non-dealer)
      if (remainder > 0) {
        s.players[this._bigBlindPlayer()].stack += remainder;
      }
    } else {
      s.players[winner].stack += s.pot;
    }

    // Stats
    this._stats.handsPlayed++;
    if (s.pot > this._stats.biggestPot) {
      this._stats.biggestPot = s.pot;
    }

    // Check for game over
    if (s.players.human.stack <= 0) {
      s.gameOver = true;
      this._emitStateChange();
      if (this._onHandComplete) this._onHandComplete(resultDetail);
      if (this._onGameOver) this._onGameOver({ winner: 'bot', loser: 'human' });
      this.stopBlindTimer();
      return;
    }
    if (s.players.bot.stack <= 0) {
      s.gameOver = true;
      this._emitStateChange();
      if (this._onHandComplete) this._onHandComplete(resultDetail);
      if (this._onGameOver) this._onGameOver({ winner: 'human', loser: 'bot' });
      this.stopBlindTimer();
      return;
    }

    // Alternate dealer button for next hand
    s.players.human.isDealer = !s.players.human.isDealer;
    s.players.bot.isDealer = !s.players.bot.isDealer;

    this._emitStateChange();
    if (this._onHandComplete) this._onHandComplete(resultDetail);
  }

  // --------------------------------------------------------------------------
  // Internal -- Blind Timer
  // --------------------------------------------------------------------------

  _scheduleBlindEscalation() {
    if (this._blindLevelIndex >= BLIND_LEVELS.length - 1) return;

    const remaining = BLIND_ESCALATION_MS - this._blindTimerElapsed;
    this._blindTimerId = setTimeout(() => {
      this._escalateBlinds();
    }, remaining);
  }

  _escalateBlinds() {
    if (this._blindLevelIndex >= BLIND_LEVELS.length - 1) return;

    this._blindLevelIndex++;
    const newLevel = BLIND_LEVELS[this._blindLevelIndex];
    this._state.blindLevel = { ...newLevel };

    // Reset timer for next level
    this._blindTimerElapsed = 0;
    this._blindTimerStart = Date.now();

    if (this._onBlindsUp) {
      this._onBlindsUp({ level: this._blindLevelIndex + 1, ...newLevel });
    }

    this._emitStateChange();

    // Schedule next escalation
    this._scheduleBlindEscalation();
  }

  // --------------------------------------------------------------------------
  // Internal -- Event Emission
  // --------------------------------------------------------------------------

  _emitStateChange() {
    if (this._onStateChange) {
      this._onStateChange(this.getState());
    }
  }
}
