/**
 * Main Game Loop — Wires PokerEngine + PokerBot + PokerUI together.
 *
 * This is the entry point loaded by index.html.
 * Handles: game init, hand flow, bot turns, player actions, animations.
 */

import { PokerEngine } from './engine.js';
import { bestHand, handCategory, compareHands } from './evaluator.js';
import { PokerBot } from './bot.js';
import { PokerUI } from './ui.js';
import * as sfx from './audio.js';

// ---------------------------------------------------------------------------
// Hand evaluator callback for PokerEngine
// ---------------------------------------------------------------------------

function evaluateHands(hands, communityCards) {
  const humanResult = bestHand(hands.human, communityCards);
  const botResult = bestHand(hands.bot, communityCards);

  const cmp = compareHands(humanResult.rank, botResult.rank);

  let winner;
  if (cmp < 0) winner = 'human';
  else if (cmp > 0) winner = 'bot';
  else winner = 'tie';

  return {
    winner,
    humanHandName: handCategory(humanResult.rank),
    botHandName: handCategory(botResult.rank),
  };
}

// ---------------------------------------------------------------------------
// Game Controller
// ---------------------------------------------------------------------------

class Game {
  constructor() {
    this.engine = new PokerEngine({
      startingStack: 200,
      evaluateHands,
    });

    this.bot = new PokerBot();
    this.ui = new PokerUI();

    this._handInProgress = false;
    this._botThinking = false;
    this._awaitingNextHand = false;
    this._blindTimerInterval = null;
    this._pendingGameOver = null;
    this._lastCommunityCount = 0;
  }

  async init() {
    // Load bot charts
    await this.bot.loadCharts();

    // Unlock audio on first interaction (browser autoplay policy)
    document.addEventListener('click', () => sfx.unlock(), { once: true });

    // Wire UI action callback
    this.ui.setActionCallback((action, amount) => this._onHumanAction(action, amount));

    // Wire engine callbacks
    this.engine.onStateChange((state) => this._onStateChange(state));
    this.engine.onHandComplete((result) => this._onHandComplete(result));
    this.engine.onGameOver((result) => this._onGameOver(result));
    this.engine.onBlindsUp((info) => this._onBlindsUp(info));

    // Wire game-over buttons
    const playAgainBtn = document.getElementById('btn-play-again');
    const quitBtn = document.getElementById('btn-quit');
    if (playAgainBtn) playAgainBtn.addEventListener('click', () => this._restart());
    if (quitBtn) quitBtn.addEventListener('click', () => this._quit());

    // ESC key to quit
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._quit();
      }
    });

    // Analysis mode toggle
    const analysisBtn = document.getElementById('btn-analysis');
    if (analysisBtn) {
      analysisBtn.addEventListener('click', () => this.ui.toggleAnalysisMode());
    }

    // Start blind timer display update
    this._startTimerDisplay();

    // Start the game
    this.engine.startGame();
    this._startNewHand();
  }

  // ── Hand Flow ──────────────────────────────────────────────────────

  async _startNewHand() {
    this._handInProgress = true;
    this._awaitingNextHand = false;
    this._botActedPreflop = false;
    this._botCbetThisHand = false;
    this.ui.disableActions();

    // Track opponent stats for this hand
    this.bot.tracker.newHand();

    // Clear stale UI from last hand
    this.ui.showBotReasoning('');
    this.ui.clearShowdownHighlights();

    // Start the hand in the engine
    this.engine.startHand();

    const state = this.engine.getState();

    // Animate dealing
    sfx.cardDeal();
    await this.ui.dealCards(state.players.human.holeCards, false);
    await this._sleep(100);
    sfx.cardDeal();
    await this._sleep(200);

    // If it's bot's turn (bot is SB/dealer and acts first preflop), trigger bot
    if (state.actingPlayer === 'bot') {
      this._triggerBotTurn();
    } else {
      this._enableHumanActions();
    }
  }

  // ── Human Actions ──────────────────────────────────────────────────

  _onHumanAction(action, amount) {
    if (this._botThinking || this._awaitingNextHand) return;

    const state = this.engine.getState();
    if (state.actingPlayer !== 'human') return;

    const result = this.engine.performAction('human', action, amount);
    if (!result.valid) {
      console.warn('Invalid action:', result.error);
      return;
    }

    // Sound + badge
    this._playActionSound(action);
    this._showActionBadge('human', action, amount);
    if (action === 'check') {
      this.ui.showCheckIndicator('human');
    }

    // Track opponent behavior
    this.bot.tracker.recordAction(action, state.street, {
      botOpenedFromSB: this._botActedPreflop && state.players.bot.isDealer,
      isFacingCbet: this._botCbetThisHand && state.street === 'flop',
    });

    // After human acts, check state
    const newState = this.engine.getState();

    if (newState.handOver) {
      // Hand ended — onHandComplete callback will handle it
      return;
    }

    if (newState.actingPlayer === 'bot') {
      this.ui.disableActions();
      this._triggerBotTurn();
    } else if (newState.actingPlayer === 'human') {
      // Still human's turn (e.g., bot went all-in, run-out happening)
      this._enableHumanActions();
    }
  }

  _enableHumanActions() {
    const state = this.engine.getState();
    const human = state.players.human;
    const betToCall = state.currentBet - human.currentBet;

    const available = {
      canFold: betToCall > 0,
      canCheck: betToCall === 0,
      canCall: betToCall > 0 && betToCall < human.stack,
      canRaise: human.stack > betToCall && state.minRaise <= human.stack,
      callAmount: Math.min(betToCall, human.stack),
      minRaise: state.currentBet + state.minRaise,
      maxRaise: human.stack + human.currentBet,
      pot: state.pot,
      blindBB: state.blindLevel.bb,
    };

    // If we can't raise (not enough chips after calling), can only call or fold
    if (available.minRaise > available.maxRaise) {
      available.canRaise = false;
    }

    this.ui.enableActions(available);
  }

  // ── Bot Turn ───────────────────────────────────────────────────────

  async _triggerBotTurn() {
    this._botThinking = true;
    this.ui.disableActions();

    // Build the game state for the bot from internal state
    const internal = this.engine._getInternalState();
    const bot = internal.players.bot;
    const human = internal.players.human;

    const botGameState = {
      street: internal.street,
      pot: internal.pot,
      communityCards: internal.communityCards,
      botCards: bot.holeCards,
      botStack: bot.stack,
      opponentStack: human.stack,
      botTotalChips: bot.stack + bot.currentBet,       // total chips in play
      opponentTotalChips: human.stack + human.currentBet, // total chips in play
      currentBet: internal.currentBet, // absolute bet level (bot computes delta itself)
      botCurrentBet: bot.currentBet,
      blindLevel: internal.blindLevel,
      botIsDealer: bot.isDealer,
      isPreflopAggressor: internal.preflopAggressor === 'bot',
      minRaise: internal.minRaise,
      maxRaise: bot.stack,
    };

    // Get bot decision
    const decision = this.bot.decide(botGameState);

    // Simulate thinking delay
    const delay = this.bot.getThinkingDelay(decision.action);
    await this._sleep(delay);

    // Execute the bot's action
    let action = decision.action;
    let amount = decision.amount;

    // For checks: show indicator + badge BEFORE engine acts so the user sees
    // the check before the next street's community cards are dealt.
    if (action === 'check') {
      this._playActionSound(action);
      this._showActionBadge('bot', action, amount);
      this.ui.showCheckIndicator('bot');
      this.ui.showBotReasoning(decision.reasoning);
      await this._sleep(800);
    }

    // Map bot decision to engine action format
    const result = this.engine.performAction('bot', action, amount);

    if (!result.valid) {
      console.warn('Bot invalid action:', result.error, decision);
      // Fallback: check or fold
      const fallback = this.engine.performAction('bot', 'check');
      if (!fallback.valid) {
        this.engine.performAction('bot', 'fold');
      }
    }

    // Track bot context for opponent modeling
    if (internal.street === 'preflop' && (action === 'raise' || action === 'allIn')) {
      this._botActedPreflop = true;
    }
    if (internal.street === 'flop' && internal.preflopAggressor === 'bot' &&
        (action === 'raise' || action === 'allIn')) {
      this._botCbetThisHand = true;
    }

    // For non-check actions: show sound/badge after engine acts (chips animate visibly).
    if (action !== 'check') {
      this._playActionSound(action);
      this._showActionBadge('bot', action, amount);
      this.ui.showBotReasoning(decision.reasoning);
    }

    this._botThinking = false;

    // Check state after bot acts
    const newState = this.engine.getState();

    if (newState.handOver) {
      // Hand ended — onHandComplete will handle
      return;
    }

    if (newState.actingPlayer === 'human') {
      this._enableHumanActions();
    } else if (newState.actingPlayer === 'bot') {
      // Bot acts again (shouldn't normally happen in HU)
      this._triggerBotTurn();
    }
  }

  // ── Action Badge ───────────────────────────────────────────────────

  _showActionBadge(player, action, amount) {
    const badgeId = player === 'human' ? 'human-action-badge' : 'bot-action-badge';
    const badge = document.getElementById(badgeId);
    if (!badge) return;

    // Clear existing classes
    badge.className = 'action-badge';

    let text = action.toUpperCase();
    if (action === 'raise' && amount) text = `RAISE ${amount}`;
    if (action === 'call' && amount) text = `CALL ${amount}`;
    if (action === 'allIn') text = 'ALL-IN';

    badge.textContent = text;
    badge.classList.add(`badge-${action === 'allIn' ? 'allin' : action}`);
    badge.classList.remove('hidden');

    // Auto-hide after 2 seconds
    setTimeout(() => badge.classList.add('hidden'), 2000);
  }

  // ── Engine Callbacks ───────────────────────────────────────────────

  _onStateChange(state) {
    // Play sound when new community cards are dealt
    const cc = state.communityCards.length;
    if (cc > this._lastCommunityCount && cc > 0) {
      sfx.communityCard();
    }
    this._lastCommunityCount = cc;

    this.ui.render(state);
  }

  async _onHandComplete(result) {
    this._handInProgress = false;
    this._awaitingNextHand = true;
    this.ui.disableActions();

    // Finalize opponent stats for this hand
    this.bot.tracker.finalizeHand();

    const state = this.engine.getState();

    // If showdown, animate card reveal and highlight winning hand
    if (result.showdown) {
      sfx.cardFlip();
      await this.ui.showdown(state.players.bot.holeCards);
      await this._sleep(500);

      // Re-render to show final board + revealed cards + hand labels
      this.ui.render(this.engine.getState());

      // Highlight winning cards
      const internal = this.engine._getInternalState();
      const humanBest = bestHand(internal.players.human.holeCards, internal.communityCards);
      const botBest = bestHand(internal.players.bot.holeCards, internal.communityCards);
      this.ui.showShowdownResult(result.winner, humanBest, botBest);
      await this._sleep(200);
    } else {
      // Re-render for fold
      this.ui.render(this.engine.getState());
    }

    // Show subtle stack flash ("+X" on winner's stack)
    if (result.winner === 'human') sfx.winPot();
    else if (result.winner === 'bot') sfx.losePot();
    this.ui.showHandResult(result);

    // Animate pot collection
    await this.ui.collectPot(result.winner);
    await this._sleep(300);

    // Re-render final stacks
    this.ui.render(this.engine.getState());

    // If game is over, let the player see the final board before showing overlay
    if (this._pendingGameOver) {
      await this._sleep(2500);
      const goResult = this._pendingGameOver;
      this._pendingGameOver = null;
      if (goResult.winner === 'human') sfx.gameOverWin();
      else sfx.gameOverLose();
      this.ui.showGameOver(goResult);
      const finalState = this.engine.getState();
      this.ui.showGameOverStats(finalState.stats, finalState.blindLevel);
      return;
    }

    // Otherwise, brief pause then next hand
    await this._sleep(result.showdown ? 1500 : 800);

    // Clear badges
    for (const id of ['human-action-badge', 'bot-action-badge']) {
      const badge = document.getElementById(id);
      if (badge) badge.classList.add('hidden');
    }

    this._startNewHand();
  }

  _onGameOver(result) {
    // Don't show immediately — stash it so _onHandComplete can show it
    // after the showdown animation finishes.
    this._pendingGameOver = result;

    // Stop timer display
    if (this._blindTimerInterval) {
      clearInterval(this._blindTimerInterval);
      this._blindTimerInterval = null;
    }
  }

  _onBlindsUp(info) {
    sfx.blindsUp();
    const blindsEl = document.getElementById('info-blinds');
    if (blindsEl) {
      blindsEl.classList.add('blinds-up');
      setTimeout(() => blindsEl.classList.remove('blinds-up'), 1500);
    }
  }

  // ── Blind Timer Display ────────────────────────────────────────────

  _startTimerDisplay() {
    // Update the timer every second
    this._blindTimerInterval = setInterval(() => {
      const remaining = this.engine.getBlindTimeRemaining();
      this.ui.updateBlindTimer(remaining);
    }, 1000);
  }

  // ── Restart ────────────────────────────────────────────────────────

  _restart() {
    // Hide game over overlay
    const overlay = document.getElementById('gameover-overlay');
    if (overlay) overlay.classList.add('hidden');

    const resultOverlay = document.getElementById('result-overlay');
    if (resultOverlay) resultOverlay.classList.add('hidden');

    // Clear stale reasoning, badges, highlights
    this.ui.showBotReasoning('');
    this.ui.clearShowdownHighlights();
    for (const id of ['human-action-badge', 'bot-action-badge']) {
      const badge = document.getElementById(id);
      if (badge) badge.classList.add('hidden');
    }

    // Reset opponent tracking and start
    this.bot.tracker.reset();
    this.engine.startGame();
    this._startTimerDisplay();
    this._startNewHand();
  }

  // ── Sound Helpers ───────────────────────────────────────────────────

  _playActionSound(action) {
    switch (action) {
      case 'fold':  sfx.fold(); break;
      case 'check': sfx.check(); break;
      case 'call':  sfx.chipBet(); break;
      case 'raise': sfx.chipBet(); break;
      case 'allIn': sfx.allIn(); break;
    }
  }

  // ── Quit ────────────────────────────────────────────────────────────

  _quit() {
    // Stop the game
    this.engine.stopBlindTimer();
    if (this._blindTimerInterval) {
      clearInterval(this._blindTimerInterval);
      this._blindTimerInterval = null;
    }

    // Tell the parent iframe to close the game
    window.parent.postMessage('poker-quit', '*');

    // If we're in fullscreen, exit it — the parent's fullscreenchange
    // handler will also close the game.
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const game = new Game();
window._game = game; // expose for debugging
game.init().catch(err => {
  console.error('Failed to start poker game:', err);
});
