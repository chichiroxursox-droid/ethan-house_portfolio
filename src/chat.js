/**
 * Chat module — handles the Ethan chatbot UI and API communication.
 * Connects to the /api/chat endpoint powered by Groq (llama-3.3-70b).
 */

const history = [];

let messagesEl = null;
let inputEl = null;
let sendBtn = null;
let isSending = false;

/**
 * Initialize chat event listeners.
 * Call this once after the DOM is ready.
 */
export function initChat() {
  messagesEl = document.getElementById('chat-messages');
  inputEl = document.getElementById('chat-input');
  sendBtn = document.getElementById('chat-send');

  if (!messagesEl || !inputEl || !sendBtn) {
    console.warn('Chat: missing DOM elements (#chat-messages, #chat-input, or #chat-send)');
    return;
  }

  sendBtn.addEventListener('click', handleSend);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

/**
 * Clear chat history and messages (useful when reopening the panel).
 */
export function clearChat() {
  history.length = 0;
  if (messagesEl) {
    messagesEl.innerHTML = '';
  }
}

/** Focus the input field (call when the chat overlay becomes visible). */
export function focusChat() {
  if (inputEl) {
    // Small delay so the overlay animation doesn't steal focus
    setTimeout(() => inputEl.focus(), 100);
  }
}

// ── Internal helpers ────────────────────────────────────────────

async function handleSend() {
  if (isSending) return;

  const text = inputEl.value.trim();
  if (!text) return;

  // Append user message to the UI
  appendMessage('user', text);
  inputEl.value = '';

  // Show loading indicator
  setLoading(true);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
    });

    if (!res.ok) {
      throw new Error(`Server responded with ${res.status}`);
    }

    const data = await res.json();

    // Always store user message for conversation continuity
    history.push({ role: 'user', content: text });

    if (data.response) {
      history.push({ role: 'assistant', content: data.response });
      appendMessage('assistant', data.response);
    } else {
      appendMessage('assistant', 'Sorry, I couldn\'t come up with a response.');
    }
  } catch (err) {
    console.error('Chat error:', err);
    appendMessage('assistant', 'Sorry, something went wrong. Try again in a moment!');
  } finally {
    setLoading(false);
  }
}

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setLoading(loading) {
  isSending = loading;
  sendBtn.disabled = loading;
  inputEl.disabled = loading;

  if (loading) {
    // Add a typing indicator
    const indicator = document.createElement('div');
    indicator.className = 'chat-msg assistant';
    indicator.id = 'chat-typing';
    indicator.textContent = '...';
    messagesEl.appendChild(indicator);
    scrollToBottom();
  } else {
    // Remove the typing indicator
    const indicator = document.getElementById('chat-typing');
    if (indicator) {
      indicator.remove();
    }
  }
}
