import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const promptPath = path.join(__dirname, '..', 'src', 'ethan-prompt.txt');
let systemPrompt = 'You are Ethan, a friendly student and developer.';
try {
  systemPrompt = fs.readFileSync(promptPath, 'utf-8').trim();
} catch (err) {
  console.warn('Chat API: Could not read ethan-prompt.txt —', err.message);
}

const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;
const rateLimitMap = new Map();

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    console.warn('Chat API: GEMINI_API_KEY is not set.');
    res.status(503).json({ error: 'Chat is not configured.' });
    return;
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW };
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (entry.count > RATE_LIMIT) {
    res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    return;
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 10_240) {
    res.status(413).json({ error: 'Payload too large.' });
    return;
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body) {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }

  const { message, history } = body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "message" field.' });
    return;
  }

  if (message.length > 5000) {
    res.status(400).json({ error: 'Message exceeds 5000 characters.' });
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
    });

    const geminiHistory = [];
    if (Array.isArray(history)) {
      for (const m of history.slice(-10)) {
        if (
          m &&
          typeof m.content === 'string' &&
          (m.role === 'user' || m.role === 'assistant')
        ) {
          geminiHistory.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          });
        }
      }
    }

    const chat = model.startChat({
      history: geminiHistory,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    });

    const result = await chat.sendMessage(message);
    const reply =
      result.response.text() || "Sorry, I couldn't respond right now.";

    res.status(200).json({ response: reply });
  } catch (err) {
    console.error('Chat API error:', err.message);
    res.status(500).json({ error: 'Chat service unavailable' });
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
