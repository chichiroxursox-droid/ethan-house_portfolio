// ============================================================================
// PokerUI — DOM renderer for the heads-up poker game.
//
// Pure ES6 module. Manipulates pre-existing DOM elements — does NOT build HTML.
// All visual state is applied via CSS classes; inline styles are avoided.
// ============================================================================

import { bestHand, handCategory } from './evaluator.js';

// ---------------------------------------------------------------------------
// Card helper (exported so tests and other modules can reuse it)
// ---------------------------------------------------------------------------

/**
 * Build a single card DOM element.
 * @param {{ rank: string, suit: string } | null} card
 *   null  → face-down (card back)
 *   object → face-up card
 * @returns {HTMLElement}
 */
export function createCardElement(card) {
  const el = document.createElement('div');
  el.className = 'card';

  if (!card) {
    el.classList.add('card-back');
    el.innerHTML = '<div class="card-pattern"></div>';
    return el;
  }

  const isRed = card.suit === 'h' || card.suit === 'd';
  el.classList.add(isRed ? 'card-red' : 'card-black');

  const suitSymbol = { s: '♠', h: '♥', d: '♦', c: '♣' }[card.suit];
  const rankDisplay = card.rank === 'T' ? '10' : card.rank;

  el.innerHTML = `
    <span class="card-rank">${rankDisplay}</span>
    <span class="card-suit">${suitSymbol}</span>
  `;

  return el;
}

// ---------------------------------------------------------------------------
// Delay helper for sequencing CSS animations
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// PokerUI
// ---------------------------------------------------------------------------

export class PokerUI {
  constructor() {
    this._actionCallback = null;
    this._raiseVisible = false;
    this._analysisMode = false;
    this._lastBotActionText = '';
    this._lastHumanActionText = '';
    this._elements = {};

    this._cacheElements();
    this._bindRaiseControls();
    this._bindGameOverButtons();
  }

  /** Toggle analysis mode (shows/hides bot reasoning). Returns the new state. */
  toggleAnalysisMode() {
    this._analysisMode = !this._analysisMode;
    const btn = document.getElementById('btn-analysis');
    if (btn) btn.classList.toggle('active', this._analysisMode);
    // Hide reasoning if turning off
    if (!this._analysisMode) {
      const el = this._el('bot-reasoning');
      if (el) el.classList.add('hidden');
    }
    return this._analysisMode;
  }

  get analysisMode() { return this._analysisMode; }

  // --------------------------------------------------------------------------
  // Element caching
  // --------------------------------------------------------------------------

  _cacheElements() {
    const ids = [
      // Info bar
      'info-blinds', 'info-timer', 'info-hand',
      // Bot area
      'bot-cards', 'bot-name', 'bot-stack', 'bot-reasoning', 'bot-action-badge',
      // Community + pot
      'community-cards', 'pot-display',
      // Human area
      'human-cards', 'human-name', 'human-stack', 'human-action-badge',
      // Action buttons
      'btn-fold', 'btn-check-call', 'btn-raise', 'btn-allin',
      'raise-slider', 'raise-amount', 'raise-controls',
      // Overlays
      'result-overlay', 'result-text',
      'gameover-overlay', 'gameover-text', 'gameover-stats',
      'btn-play-again', 'btn-quit',
    ];

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        // Store with camelCase key derived from the id
        this._elements[id] = el;
      }
    }

    // Preset raise buttons (optional — may not exist)
    this._raisePresets = document.querySelectorAll('[data-raise-preset]');
  }

  _el(id) {
    return this._elements[id] ?? null;
  }

  // --------------------------------------------------------------------------
  // Main render — called on every state change
  // --------------------------------------------------------------------------

  /**
   * Update the entire UI from a game state snapshot.
   * @param {object} state — as returned by PokerEngine.getState()
   */
  render(state) {
    this._renderInfoBar(state);
    this._renderBotArea(state);
    this._renderCommunityCards(state);
    this._renderPot(state);
    this._renderStreetBets(state);
    this._renderHumanArea(state);
    this._renderHandLabels(state);
    this._renderActionVisibility(state);
  }

  // --------------------------------------------------------------------------
  // Info bar
  // --------------------------------------------------------------------------

  _renderInfoBar(state) {
    const blinds = this._el('info-blinds');
    const hand   = this._el('info-hand');

    if (blinds) {
      blinds.textContent = `Blinds: ${state.blindLevel.sb}/${state.blindLevel.bb}`;
    }
    if (hand) {
      hand.textContent = `Hand #${state.handNumber}`;
    }
    // Timer is updated separately via updateBlindTimer()
  }

  // --------------------------------------------------------------------------
  // Bot area
  // --------------------------------------------------------------------------

  _renderBotArea(state) {
    const bot = state.players.bot;

    const stackEl   = this._el('bot-stack');
    const cardsEl   = this._el('bot-cards');
    const nameEl    = this._el('bot-name');

    if (stackEl) stackEl.textContent = bot.stack;

    if (nameEl) {
      nameEl.classList.toggle('is-dealer', !!bot.isDealer);
      nameEl.classList.toggle('is-acting', state.actingPlayer === 'bot');
    }

    if (cardsEl) {
      // Only re-render if card count changed (avoids flickering during play)
      const cardCount = bot.holeCards.length;
      if (cardCount === 0) {
        cardsEl.innerHTML = '';
      } else if (cardsEl.children.length !== cardCount) {
        cardsEl.innerHTML = '';
        for (const card of bot.holeCards) {
          cardsEl.appendChild(createCardElement(card));
        }
      }
      cardsEl.classList.toggle('player-folded', !!bot.folded);
    }
  }

  // --------------------------------------------------------------------------
  // Community cards
  // --------------------------------------------------------------------------

  _renderCommunityCards(state) {
    const container = this._el('community-cards');
    if (!container) return;

    const dealt = state.communityCards;
    const total = 5;

    // Only rebuild when the count changed (flop/turn/river transitions)
    if (container.children.length === total &&
        container.querySelectorAll('.card-empty').length === (total - dealt.length)) {
      return;
    }

    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
      if (i < dealt.length) {
        container.appendChild(createCardElement(dealt[i]));
      } else {
        const empty = document.createElement('div');
        empty.className = 'card card-empty';
        container.appendChild(empty);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Pot
  // --------------------------------------------------------------------------

  _renderPot(state) {
    const el = this._el('pot-display');
    if (el) el.textContent = `Pot: ${state.pot}`;
  }

  // --------------------------------------------------------------------------
  // Street bets (chips in the middle)
  // --------------------------------------------------------------------------

  _renderStreetBets(state) {
    const botBetEl = document.getElementById('bot-bet');
    const humanBetEl = document.getElementById('human-bet');

    const botBet = state.players.bot.currentBet;
    const humanBet = state.players.human.currentBet;

    if (botBetEl) {
      if (botBet > 0 && !state.handOver) {
        botBetEl.textContent = botBet;
        botBetEl.classList.remove('hidden');
      } else {
        botBetEl.classList.add('hidden');
      }
    }

    if (humanBetEl) {
      if (humanBet > 0 && !state.handOver) {
        humanBetEl.textContent = humanBet;
        humanBetEl.classList.remove('hidden');
      } else {
        humanBetEl.classList.add('hidden');
      }
    }
  }

  /**
   * Briefly show a "✓ check" indicator in the player's bet slot.
   * Used when a player checks (no chips go in, so the bet element would otherwise stay hidden).
   */
  showCheckIndicator(player) {
    const el = document.getElementById(player === 'bot' ? 'bot-bet' : 'human-bet');
    if (!el) return;
    el.textContent = 'check';
    el.classList.remove('hidden');
    el.classList.add('check-indicator');
    clearTimeout(this[`_checkTimer_${player}`]);
    this[`_checkTimer_${player}`] = setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('check-indicator');
      el.textContent = '';
    }, 1100);
  }

  // --------------------------------------------------------------------------
  // Hand labels (e.g. "Pair", "Flush")
  // --------------------------------------------------------------------------

  _renderHandLabels(state) {
    const humanLabel = document.getElementById('human-hand-label');
    const botLabel = document.getElementById('bot-hand-label');
    const cc = state.communityCards;

    // Human hand label — show once there are community cards
    if (humanLabel) {
      const humanCards = state.players.human.holeCards;
      if (cc.length >= 3 && humanCards.length === 2 && humanCards[0] && !state.players.human.folded) {
        const { rank } = bestHand(humanCards, cc);
        humanLabel.textContent = handCategory(rank);
        humanLabel.classList.remove('hidden', 'winner-label', 'loser-label');
      } else {
        humanLabel.classList.add('hidden');
      }
    }

    // Bot hand label — only on showdown (cards revealed)
    if (botLabel) {
      const botCards = state.players.bot.holeCards;
      if (state.showdown && cc.length >= 3 && botCards.length === 2 && botCards[0]) {
        const { rank } = bestHand(botCards, cc);
        botLabel.textContent = handCategory(rank);
        botLabel.classList.remove('hidden', 'winner-label', 'loser-label');
      } else {
        botLabel.classList.add('hidden');
      }
    }
  }

  /**
   * Highlight the winning hand's label and cards at showdown.
   * @param {'human'|'bot'|'tie'} winner
   * @param {{ rank: number, cards: Array }} humanBest
   * @param {{ rank: number, cards: Array }} botBest
   */
  showShowdownResult(winner, humanBest, botBest) {
    const humanLabel = document.getElementById('human-hand-label');
    const botLabel = document.getElementById('bot-hand-label');

    if (humanLabel) {
      humanLabel.classList.toggle('winner-label', winner === 'human');
      humanLabel.classList.toggle('loser-label', winner === 'bot');
    }
    if (botLabel) {
      botLabel.classList.toggle('winner-label', winner === 'bot');
      botLabel.classList.toggle('loser-label', winner === 'human');
    }

    // Highlight winning cards on the board + in the winner's hand
    if (winner !== 'tie') {
      const winningCards = winner === 'human' ? humanBest?.cards : botBest?.cards;
      if (winningCards) {
        this._highlightWinningCards(winner, winningCards);
      }
    }
  }

  _highlightWinningCards(winner, winningCards) {
    // Find all card elements in community + winner's hand
    const containers = [
      document.getElementById('community-cards'),
      document.getElementById(winner === 'human' ? 'human-cards' : 'bot-cards'),
    ];

    for (const container of containers) {
      if (!container) continue;
      for (const cardEl of container.querySelectorAll('.card')) {
        const rankEl = cardEl.querySelector('.card-rank');
        const suitEl = cardEl.querySelector('.card-suit');
        if (!rankEl || !suitEl) continue;

        const displayRank = rankEl.textContent.trim();
        const suitSymbol = suitEl.textContent.trim();
        const suitMap = { '\u2660': 's', '\u2665': 'h', '\u2666': 'd', '\u2663': 'c' };
        const rank = displayRank === '10' ? 'T' : displayRank;
        const suit = suitMap[suitSymbol] || '';

        const isWinning = winningCards.some(c => c.rank === rank && c.suit === suit);
        cardEl.classList.toggle('winning-card', isWinning);
      }
    }
  }

  clearShowdownHighlights() {
    document.querySelectorAll('.winning-card').forEach(el => el.classList.remove('winning-card'));
    const humanLabel = document.getElementById('human-hand-label');
    const botLabel = document.getElementById('bot-hand-label');
    if (humanLabel) humanLabel.classList.remove('winner-label', 'loser-label');
    if (botLabel) botLabel.classList.remove('winner-label', 'loser-label');
  }

  // --------------------------------------------------------------------------
  // Human area
  // --------------------------------------------------------------------------

  _renderHumanArea(state) {
    const human = state.players.human;

    const stackEl = this._el('human-stack');
    const cardsEl = this._el('human-cards');
    const nameEl  = this._el('human-name');

    if (stackEl) stackEl.textContent = human.stack;

    if (nameEl) {
      nameEl.classList.toggle('is-dealer', !!human.isDealer);
      nameEl.classList.toggle('is-acting', state.actingPlayer === 'human');
    }

    if (cardsEl) {
      const cardCount = human.holeCards.length;
      if (cardCount === 0) {
        cardsEl.innerHTML = '';
      } else if (cardsEl.children.length !== cardCount) {
        cardsEl.innerHTML = '';
        for (const card of human.holeCards) {
          cardsEl.appendChild(createCardElement(card));
        }
      }
      cardsEl.classList.toggle('player-folded', !!human.folded);
    }
  }

  // --------------------------------------------------------------------------
  // Action button visibility
  // --------------------------------------------------------------------------

  _renderActionVisibility(state) {
    const isHumanTurn = state.actingPlayer === 'human' && !state.handOver && !state.gameOver;
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.classList.toggle('actions-hidden', !isHumanTurn);
    }

    if (!isHumanTurn) {
      this._hideRaiseControls();
    }
  }

  // --------------------------------------------------------------------------
  // Public: show / hide bot reasoning
  // --------------------------------------------------------------------------

  /**
   * Display the bot's reasoning text (e.g. "C-bet for value (2/3 pot)").
   * @param {string} text
   */
  showBotReasoning(text) {
    const el = this._el('bot-reasoning');
    if (!el) return;

    if (text && this._analysisMode) {
      el.textContent = `"${text}"`;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  // --------------------------------------------------------------------------
  // Public: action badges
  // --------------------------------------------------------------------------

  /**
   * Show a player's last action as a badge label.
   * @param {'human'|'bot'} player
   * @param {string} text  e.g. "RAISE 12", "CHECK", "FOLD"
   */
  showActionBadge(player, text) {
    const el = this._el(`${player}-action-badge`);
    if (!el) return;

    el.textContent = text;
    el.classList.remove('badge-hidden');

    // Auto-hide after 2.5 s
    clearTimeout(el._badgeTimer);
    el._badgeTimer = setTimeout(() => {
      el.classList.add('badge-hidden');
    }, 2500);
  }

  // --------------------------------------------------------------------------
  // Public: hand result overlay
  // --------------------------------------------------------------------------

  /**
   * Show the hand result overlay.
   * @param {{ winner: string, pot: number, showdown: boolean, humanHandName?: string, botHandName?: string }} result
   */
  showHandResult(result) {
    // Subtle stack flash instead of overlay
    const pot = result.pot;

    if (result.winner === 'human' || result.winner === 'bot') {
      this._flashStack(result.winner, `+${pot}`);
    } else if (result.winner === 'tie') {
      const half = Math.floor(pot / 2);
      if (half > 0) {
        this._flashStack('human', `+${half}`);
        this._flashStack('bot', `+${half}`);
      }
    }
  }

  /** Show a floating +/- number near a player's stack. */
  _flashStack(player, text) {
    const stackEl = this._el(player === 'human' ? 'human-stack' : 'bot-stack');
    if (!stackEl) return;

    const flash = document.createElement('span');
    flash.className = `stack-flash ${text.startsWith('+') ? 'flash-win' : 'flash-lose'}`;
    flash.textContent = text;

    // Position relative to the stack element
    stackEl.parentElement.style.position = 'relative';
    stackEl.parentElement.appendChild(flash);

    // Clean up after animation
    flash.addEventListener('animationend', () => flash.remove());
  }

  hideHandResult() {
    // No-op — no overlay to hide
  }

  // --------------------------------------------------------------------------
  // Public: game over overlay
  // --------------------------------------------------------------------------

  /**
   * Show the game-over screen.
   * @param {{ winner: 'human'|'bot' }} result
   */
  showGameOver(result) {
    const overlay   = this._el('gameover-overlay');
    const textEl    = this._el('gameover-text');
    if (!overlay || !textEl) return;

    textEl.textContent = result.winner === 'human' ? 'You Win!' : 'PokerBot Wins!';
    overlay.classList.toggle('gameover-win',  result.winner === 'human');
    overlay.classList.toggle('gameover-loss', result.winner === 'bot');
    overlay.classList.remove('hidden');
    overlay.classList.add('overlay-visible');
  }

  /**
   * Populate the stats section inside the game-over overlay.
   * @param {{ handsPlayed: number, biggestPot: number }} stats
   * @param {{ sb: number, bb: number }} blindLevel
   */
  showGameOverStats(stats, blindLevel) {
    const el = this._el('gameover-stats');
    if (!el) return;

    el.innerHTML = `
      <span>Hands played: <strong>${stats.handsPlayed}</strong></span>
      <span>Biggest pot: <strong>${stats.biggestPot}</strong></span>
      <span>Final blinds: <strong>${blindLevel.sb}/${blindLevel.bb}</strong></span>
    `;
  }

  // --------------------------------------------------------------------------
  // Public: blind timer
  // --------------------------------------------------------------------------

  /**
   * Update the timer display in the info bar.
   * @param {number} secondsLeft
   */
  updateBlindTimer(secondsLeft) {
    const el = this._el('info-timer');
    if (!el) return;

    if (secondsLeft <= 0) {
      el.textContent = '--:--';
      return;
    }

    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;

    // Visual warning when close to escalation
    el.classList.toggle('timer-warning', secondsLeft <= 30);
  }

  // --------------------------------------------------------------------------
  // Public: action callback registration
  // --------------------------------------------------------------------------

  /**
   * Register the function that receives player actions.
   * @param {Function} callback — (action: string, amount?: number) => void
   */
  setActionCallback(callback) {
    this._actionCallback = callback;
    this._bindActionButtons();
  }

  // --------------------------------------------------------------------------
  // Public: enable / disable action controls
  // --------------------------------------------------------------------------

  /**
   * Enable the action buttons and configure them for the current situation.
   * @param {{
   *   canFold: boolean, canCheck: boolean, canCall: boolean, canRaise: boolean,
   *   callAmount: number, minRaise: number, maxRaise: number,
   *   blindBB: number
   * }} available
   */
  enableActions(available) {
    const fold      = this._el('btn-fold');
    const checkCall = this._el('btn-check-call');
    const raise     = this._el('btn-raise');
    const allIn     = this._el('btn-allin');
    const slider    = this._el('raise-slider');
    const display   = this._el('raise-amount');

    if (fold) {
      fold.disabled = !available.canFold;
      fold.classList.toggle('btn-disabled', !available.canFold);
    }

    if (checkCall) {
      const hasAction = available.canCheck || available.canCall;
      checkCall.disabled = !hasAction;
      checkCall.classList.toggle('btn-disabled', !hasAction);

      if (available.canCheck) {
        checkCall.textContent = 'Check';
      } else if (available.canCall) {
        checkCall.textContent = `Call ${available.callAmount}`;
      }
    }

    if (raise) {
      raise.disabled = !available.canRaise;
      raise.classList.toggle('btn-disabled', !available.canRaise);
    }

    if (allIn) {
      allIn.disabled = false;
      allIn.classList.remove('btn-disabled');
    }

    // Configure raise slider
    if (slider && available.canRaise) {
      slider.min   = available.minRaise;
      slider.max   = available.maxRaise;
      slider.step  = available.blindBB ?? 1;

      // Default value: min raise
      if (Number(slider.value) < available.minRaise ||
          Number(slider.value) > available.maxRaise) {
        slider.value = available.minRaise;
      }

      if (display) display.value = slider.value;

      this._configureRaisePresets(available);
    }
  }

  /**
   * Disable all action buttons (e.g., while the bot is thinking).
   */
  disableActions() {
    for (const id of ['btn-fold', 'btn-check-call', 'btn-raise', 'btn-allin']) {
      const el = this._el(id);
      if (el) {
        el.disabled = true;
        el.classList.add('btn-disabled');
      }
    }
    this._hideRaiseControls();
  }

  // --------------------------------------------------------------------------
  // Animations
  // --------------------------------------------------------------------------

  /**
   * Animate dealing hole cards.
   * Cards are already rendered by render() — this adds the dealing CSS class
   * briefly so the CSS transition fires.
   * @param {Array} humanCards
   * @param {boolean} botCardsVisible — true only on showdown / demo
   */
  async dealCards(humanCards, botCardsVisible = false) {
    // Rebuild human card elements
    const humanEl = this._el('human-cards');
    if (humanEl) {
      humanEl.innerHTML = '';
      for (const card of humanCards) {
        const el = createCardElement(card);
        el.classList.add('card-dealing');
        humanEl.appendChild(el);
      }
    }

    // Rebuild bot card elements
    const botEl = this._el('bot-cards');
    if (botEl) {
      botEl.innerHTML = '';
      const botCards = botCardsVisible
        ? humanCards  // placeholder — caller should pass real bot cards
        : [null, null];
      for (const card of botCards) {
        const el = createCardElement(card);
        el.classList.add('card-dealing');
        botEl.appendChild(el);
      }
    }

    // Allow dealing animation to play, then remove class
    await delay(50);
    document.querySelectorAll('.card-dealing').forEach(el => {
      el.classList.remove('card-dealing');
    });

    await delay(400);
  }

  /**
   * Animate dealing community cards one at a time.
   * @param {{ rank: string, suit: string }[]} cards — the full set dealt so far
   * @param {number} count — how many new cards to animate (e.g. 3 for flop)
   */
  async dealCommunityCards(cards, count) {
    const container = this._el('community-cards');
    if (!container) return;

    // Determine which slots already have real cards
    const startIndex = cards.length - count;

    for (let i = startIndex; i < cards.length; i++) {
      // Replace the empty slot at position i
      const slots = container.children;
      if (slots[i]) {
        const newCard = createCardElement(cards[i]);
        newCard.classList.add('card-dealing');
        container.replaceChild(newCard, slots[i]);
        await delay(50);
        newCard.classList.remove('card-dealing');
        await delay(180);
      }
    }
  }

  /**
   * Flip the bot's face-down cards to reveal them at showdown.
   * @param {{ rank: string, suit: string }[]} botCards
   */
  async showdown(botCards) {
    const botEl = this._el('bot-cards');
    if (!botEl) return;

    const cardEls = [...botEl.children];
    for (let i = 0; i < cardEls.length; i++) {
      cardEls[i].classList.add('card-revealing');
      await delay(180);

      const revealed = createCardElement(botCards[i] ?? null);
      revealed.classList.add('card-revealing');
      botEl.replaceChild(revealed, cardEls[i]);
      await delay(50);
      revealed.classList.remove('card-revealing');
      await delay(180);
    }
  }

  /**
   * Animate chips collecting to the winner's side.
   * This is a lightweight class-based animation — CSS handles the motion.
   * @param {'human'|'bot'} winner
   */
  async collectPot(winner) {
    const potEl = this._el('pot-display');
    if (potEl) {
      potEl.classList.add('pot-collecting');
      potEl.classList.add(winner === 'human' ? 'pot-to-human' : 'pot-to-bot');
    }

    await delay(500);

    if (potEl) {
      potEl.classList.remove('pot-collecting', 'pot-to-human', 'pot-to-bot');
    }
  }

  // --------------------------------------------------------------------------
  // Internal: raise controls
  // --------------------------------------------------------------------------

  _bindRaiseControls() {
    const raiseBtn = this._el('btn-raise');
    const slider   = this._el('raise-slider');
    const display  = this._el('raise-amount');

    // Raise button toggle is handled in _bindActionButtons — no listener here
    // to avoid duplicate-click bugs.

    if (slider && display) {
      // Slider → input sync
      slider.addEventListener('input', () => {
        display.value = slider.value;
      });
      // Input → slider sync (typing a number updates the slider)
      display.addEventListener('input', () => {
        const val = Number(display.value);
        if (!isNaN(val)) slider.value = val;
      });
      // Clamp on blur so the value stays in range
      display.addEventListener('blur', () => {
        const min = Number(slider.min);
        const max = Number(slider.max);
        let val = Number(display.value);
        if (isNaN(val) || val < min) val = min;
        if (val > max) val = max;
        display.value = val;
        slider.value = val;
      });
      // Enter key confirms the raise
      display.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          display.blur(); // clamp first
          const btn = this._el('btn-raise');
          if (btn && this._raiseVisible) btn.click();
        }
      });
    }

    // Raise preset buttons (data-raise-preset="min|halfpot|pot|allin")
    document.querySelectorAll('[data-raise-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!slider) return;
        const preset = btn.dataset.raisePreset;
        this._applyRaisePreset(preset);
        if (display) display.value = slider.value;
      });
    });

    // "Confirm raise" — clicking the raise button again after slider is shown
    // This is handled inside _bindActionButtons so that actionCallback is used.
  }

  _configureRaisePresets(available) {
    // We store available info so presets can compute half-pot, pot amounts
    this._raiseAvailable = available;
  }

  _applyRaisePreset(preset) {
    const slider = this._el('raise-slider');
    if (!slider || !this._raiseAvailable) return;

    const { minRaise, maxRaise } = this._raiseAvailable;
    // We need pot size for half-pot/pot presets — stored from last enableActions call
    const pot = this._raiseAvailable.pot ?? 0;

    let value;
    switch (preset) {
      case 'min':
        value = minRaise;
        break;
      case 'halfpot':
        value = Math.round(pot / 2);
        break;
      case 'pot':
        value = pot;
        break;
      case 'allin':
        value = maxRaise;
        break;
      default:
        value = minRaise;
    }

    slider.value = Math.max(minRaise, Math.min(maxRaise, value));

    const display = this._el('raise-amount');
    if (display) display.value = slider.value;
  }

  _toggleRaiseControls() {
    const controls = this._el('raise-controls');
    if (!controls) return;

    this._raiseVisible = !this._raiseVisible;
    controls.classList.toggle('hidden', !this._raiseVisible);
    controls.classList.toggle('raise-controls-visible', this._raiseVisible);

    const btn = this._el('btn-raise');
    if (btn) btn.classList.toggle('btn-raise-active', this._raiseVisible);
  }

  _hideRaiseControls() {
    this._raiseVisible = false;
    const controls = this._el('raise-controls');
    const btn      = this._el('btn-raise');
    if (controls) {
      controls.classList.add('hidden');
      controls.classList.remove('raise-controls-visible');
    }
    if (btn) btn.classList.remove('btn-raise-active');
  }

  // --------------------------------------------------------------------------
  // Internal: action button wiring
  // --------------------------------------------------------------------------

  _bindActionButtons() {
    const fold      = this._el('btn-fold');
    const checkCall = this._el('btn-check-call');
    const raise     = this._el('btn-raise');
    const allIn     = this._el('btn-allin');
    const slider    = this._el('raise-slider');

    const emit = (action, amount) => {
      if (this._actionCallback) this._actionCallback(action, amount);
    };

    // Fold
    if (fold && !fold._bound) {
      fold._bound = true;
      fold.addEventListener('click', () => {
        if (fold.disabled) return;
        emit('fold');
      });
    }

    // Check / Call (text on button determines which)
    if (checkCall && !checkCall._bound) {
      checkCall._bound = true;
      checkCall.addEventListener('click', () => {
        if (checkCall.disabled) return;
        const isCheck = checkCall.textContent.trim().startsWith('Check');
        emit(isCheck ? 'check' : 'call');
      });
    }

    // Raise — first click shows slider, second click (or a separate "Confirm Raise" btn)
    // sends the raise. We re-use the same button: if slider is already visible, treat
    // the click as a confirm.
    if (raise && !raise._bound) {
      raise._bound = true;
      raise.addEventListener('click', () => {
        if (raise.disabled) return;
        if (this._raiseVisible) {
          // Second click: confirm raise — prefer typed input value
          const display = this._el('raise-amount');
          const amount = display ? Number(display.value) : (slider ? Number(slider.value) : 0);
          emit('raise', amount);
          this._hideRaiseControls();
        } else {
          // First click: show slider
          this._toggleRaiseControls();
        }
      });
    }

    // All-in
    if (allIn && !allIn._bound) {
      allIn._bound = true;
      allIn.addEventListener('click', () => {
        if (allIn.disabled) return;
        emit('allIn');
      });
    }
  }

  // --------------------------------------------------------------------------
  // Internal: game-over overlay buttons
  // --------------------------------------------------------------------------

  _bindGameOverButtons() {
    const playAgain = this._el('btn-play-again');
    const quit      = this._el('btn-quit');

    if (playAgain && !playAgain._bound) {
      playAgain._bound = true;
      playAgain.addEventListener('click', () => {
        if (this._actionCallback) this._actionCallback('playAgain');
      });
    }

    if (quit && !quit._bound) {
      quit._bound = true;
      quit.addEventListener('click', () => {
        window.parent.postMessage('poker-quit', window.location.origin);
      });
    }
  }
}
