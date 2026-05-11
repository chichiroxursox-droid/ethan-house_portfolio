import { defineConfig, loadEnv } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env into process.env so API keys are available
const env = loadEnv('', __dirname, '');
Object.assign(process.env, env);

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: { outDir: 'dist' },
  plugins: [
    {
      name: 'no-cache-games',
      configureServer(server) {
        // Prevent browser from caching game files (pck, wasm, js)
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/games/')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
          next();
        });
      },
    },
    {
      name: 'chat-api',
      configureServer(server) {
        // Read the system prompt once at server start
        const promptPath = path.resolve(__dirname, 'src/ethan-prompt.txt');
        let systemPrompt = '';
        try {
          systemPrompt = fs.readFileSync(promptPath, 'utf-8').trim();
        } catch (err) {
          console.warn('Chat API: Could not read ethan-prompt.txt —', err.message);
          systemPrompt = 'You are Ethan, a friendly student and developer.';
        }

        // Simple rate limiter: max 10 requests per minute per IP
        const rateLimitMap = new Map();
        const RATE_LIMIT = 10;
        const RATE_WINDOW = 60_000;

        server.middlewares.use('/api/chat', async (req, res) => {
          // CSP + security headers
          res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'");
          res.setHeader('X-Content-Type-Options', 'nosniff');

          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          // Rate limiting
          const ip = req.socket.remoteAddress || 'unknown';
          const now = Date.now();
          let entry = rateLimitMap.get(ip);
          if (!entry || now > entry.resetAt) {
            entry = { count: 0, resetAt: now + RATE_WINDOW };
          }
          entry.count++;
          rateLimitMap.set(ip, entry);
          if (entry.count > RATE_LIMIT) {
            res.statusCode = 429;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Too many requests. Try again in a minute.' }));
            return;
          }

          if (!process.env.GEMINI_API_KEY) {
            console.warn('Chat API: GEMINI_API_KEY is not set. Chat will not work.');
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: 'Chat is not configured yet. Please set the GEMINI_API_KEY environment variable.',
            }));
            return;
          }

          // Reject oversized payloads (max 10 KB)
          const contentLength = parseInt(req.headers['content-length'] || '0', 10);
          if (contentLength > 10_240) {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Payload too large.' }));
            return;
          }

          let body = '';
          let tooLarge = false;
          req.on('data', (chunk) => {
            if (tooLarge) return;
            body += chunk;
            if (body.length > 10_240) {
              tooLarge = true;
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Payload too large.' }));
            }
          });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const { message, history } = JSON.parse(body);

              if (!message || typeof message !== 'string') {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing or invalid "message" field.' }));
                return;
              }

              if (message.length > 5000) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Message exceeds 5000 characters.' }));
                return;
              }

              const { GoogleGenerativeAI } = await import('@google/generative-ai');
              const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
              const model = genAI.getGenerativeModel({
                model: 'gemini-2.5-flash',
                systemInstruction: systemPrompt,
              });

              // Convert and validate history
              const geminiHistory = [];
              if (Array.isArray(history)) {
                for (const m of history.slice(-10)) {
                  if (m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')) {
                    geminiHistory.push({
                      role: m.role === 'assistant' ? 'model' : 'user',
                      parts: [{ text: m.content }],
                    });
                  }
                }
              }

              const chat = model.startChat({
                history: geminiHistory,
                generationConfig: {
                  maxOutputTokens: 2048,
                  temperature: 0.7,
                },
              });

              const result = await chat.sendMessage(message);
              const reply = result.response.text()
                || 'Sorry, I couldn\'t respond right now.';

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ response: reply }));
            } catch (err) {
              console.error('Chat API error:', err.message);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Chat service unavailable' }));
            }
          });
        });
      },
    },
  ],
});
