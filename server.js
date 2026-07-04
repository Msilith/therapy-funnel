// © 2025–2026 Ssilith. Proprietary. All rights reserved. Commercial use requires royalties. See LICENSE.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Resend } = require('resend');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/therapyfunnel';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-in-production';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_7CPm7vCX_LpuLM1BsCzRjCUsb7HzJXpVq';

const resend = new Resend(RESEND_API_KEY);
const FROM_EMAIL = 'TherapyVoid <onboarding@resend.dev>';
// Когда домен будет верифицирован:
// const FROM_EMAIL = 'TherapyVoid <noreply@therapyvoid.com>';

// ─── PostgreSQL Pool (Neon) ───
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ─── Rate Limiter ───
const rateLimit = new Map();
function rateLimiter(maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    if (!rateLimit.has(ip)) rateLimit.set(ip, []);
    const timestamps = rateLimit.get(ip).filter(ts => now - ts < windowMs);
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ error: 'Слишком много запросов. Подождите минуту.' });
    }
    timestamps.push(now);
    rateLimit.set(ip, timestamps);
    next();
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── CORS ───
app.use(cors());

// ─── Защита Render: не больше 10 одновременных запросов ───
let activeRequests = 0;
const MAX_CONCURRENT = 10;
app.use((req, res, next) => {
  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(503).json({ error: 'Сервер перегружен, попробуйте через пару секунд' });
  }
  activeRequests++;
  res.on('finish', () => { activeRequests--; });
  next();
});
app.use(express.json());
app.use(express.static('.'));

// ─── Database Init ───
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        tier TEXT DEFAULT 'free',
        trial_sessions_left INTEGER DEFAULT 6,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        scores JSONB,
        hero TEXT,
        school_code TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trial_sessions (
        id SERIAL PRIMARY KEY,
        trial_id TEXT UNIQUE NOT NULL,
        message_count INTEGER DEFAULT 0,
        max_messages INTEGER DEFAULT 5,
        history JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS email_codes (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ PostgreSQL tables ready');
  } finally {
    client.release();
  }
}

initDB().catch(err => {
  console.error('DB init error:', err.message, '- running without database');
});

// ─── Гештальт-терапевт: системный промпт ───
const GESTALT_PROMPT = `Ты — AI-терапевт, проводящий психотерапевтические сессии в подходе гештальт-терапии с акцентом на телесные ощущения и экзистенциальные вопросы. Твой стиль: бережный, исследовательский, без интерпретаций. Ты не даёшь советов, не ставишь диагнозов.

Твои принципы:
- Всегда начинай с вопроса: «Что ты сейчас чувствуешь в теле?» или «На чём твоё внимание прямо сейчас?»
- Помогай клиенту различать ощущения, эмоции, мысли.
- При повторяющихся историях возвращай к телу: «А что сейчас происходит в твоём теле, когда ты это рассказываешь?»
- Используй простые эксперименты: «Попробуй усилить это ощущение», «Скажи эту фразу пустому стулу», «Подыши вместе со мной 3 раза».
- Если клиент говорит об абстрактных проблемах — конкретизируй через тело и действие: «Где в теле это ощущается? Какого оно цвета?»
- Завершай сессию коротким заземлением: «Что сейчас изменилось в теле по сравнению с началом?»
- Говори на русском языке, если клиент говорит по-русски.
- Будь краток: 2-5 предложений за ответ. Не читай лекций.

ВАЖНО — ГРАНИЦЫ РОЛИ:
Ты ТОЛЬКО психотерапевт. Если пользователь просит написать код, решить задачу, составить текст, перевести, объяснить техническую тему, дать бизнес-совет, или ЛЮБУЮ другую не-терапевтическую задачу — ответь строго: «Я здесь только для психотерапевтических бесед. Если у вас есть запрос, связанный с чувствами, переживаниями или отношениями, я рядом.» И остановись. Никаких исключений.

Ты НЕ ДОЛЖЕН:
- Давать интерпретации («У тебя детская травма»).
- Вести в прошлое без запроса клиента.
- Предлагать медицинские диагнозы или лекарства.
- При признаках кризиса (суицидальные мысли, психоз) — скажи: «То, что ты описываешь, требует помощи живого специалиста. Пожалуйста, обратись к психотерапевту или в службу доверия (112 в России, 988 в США)».`;

// ─── Промпты других школ ───
const CBT_PROMPT = `Ты — AI-терапевт в когнитивно-поведенческом подходе. Структурированный, конкретный.
Выявляй: ситуация → мысль → эмоция → поведение. Лови автоматические мысли. Обучай оспариванию: доказательства ЗА и ПРОТИВ. Предлагай поведенческие эксперименты. Техника падающей стрелы: «И что тогда? А если это — что тогда?» Будь краток: 2-5 предложений. Только психотерапия. Кризис — перенаправь.`;

const PSYCHOANALYTIC_PROMPT = `Ты — AI-терапевт в психодинамическом подходе. Исследовательский, внимательный к скрытым смыслам.
Слушай повторы, оговорки, умолчания. Возвращай к детству: «Это напоминает ранние годы?» Замечай перенос. Связывай паттерны через свободные ассоциации. Работай со снами. Будь краток. Только психотерапия. Кризис — перенаправь.`;

const EXISTENTIAL_PROMPT = `Ты — AI-терапевт в экзистенциальном подходе. Философский, глубокий.
Четыре данности: смерть, свобода, одиночество, бессмысленность. «Что для тебя значит быть свободным?» «Если бы год — что изменилось бы?» «Я должен» → «Я выбираю». Помогай найти авторство жизни. Будь краток. Только психотерапия. Кризис — перенаправь.`;

const CHRISTIAN_PROMPT = `Ты — AI-агент христианского духовного наставника. Ты помогаешь размышлять о жизни в свете веры и Писания. Не заменяешь священника.
Начинай с молитвенного настроя. Возвращай к Писанию: «Какое место из Евангелия отзывается?» Помогай в различении: «Как отличить голос Бога от голоса страха?» Работай с сомнением бережно. Используй ресурсы: молитва, пост, молчание, дела милосердия. При суицидальных мыслях — перенаправь к живому специалисту. Будь краток.`;

const ISLAMIC_PROMPT = `Ты — AI-агент исламского духовного наставника. Помогаешь размышлять в свете Корана и Сунны. Не заменяешь имама.
Начинай с мысленной басмалы. Возвращай к таваккулю: «Что в твоих руках, а что — Всевышнему?» Укрепляй сабр (терпение): «Аллах с терпеливыми» (2:153). Напоминай о шукр (благодарности). Используй ресурсы: дуа, зикр, истигфар, садака. Не даёшь фетв. При суицидальных мыслях — к специалисту. Будь краток.`;

// ─── Выбор промпта по режиму ───
const PROMPTS = {
  gestalt: GESTALT_PROMPT,
  cbt: CBT_PROMPT,
  psychoanalytic: PSYCHOANALYTIC_PROMPT,
  existential: EXISTENTIAL_PROMPT,
  christian: CHRISTIAN_PROMPT,
  islamic: ISLAMIC_PROMPT
};

// ─── Классификатор: психология или нет ───
const GUARD_PROMPT = `Ты — классификатор. Определи, относится ли сообщение пользователя к психотерапии, психологии, психическому здоровью, чувствам, эмоциям, отношениям или самоисследованию.

Ответь ровно одним словом: YES или NO.

YES — если сообщение о чувствах, переживаниях, настроении, отношениях, стрессе, тревоге, смысле жизни, самопознании, терапии, детстве, снах, конфликтах, телесных ощущениях, усталости, мотивации.

NO — если сообщение просит написать код, решить задачу, перевести текст, дать бизнес-совет, техническую консультацию, математику, программирование, или любую не-психологическую задачу.

Сообщение:`;

// ─── JWT Middleware ───
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET);
    } catch {}
  }
  next();
}

// ─── Auth Routes ───
app.post('/api/auth/register', rateLimiter(5, 60000), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 4) {
    return res.status(400).json({ error: 'Email и пароль (мин 4 символа) обязательны' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Некорректный формат email' });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, hash]
    );

    const user = { id: result.rows[0].id, email, tier: 'free', trialSessionsLeft: 6 };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/auth/login', rateLimiter(10, 60000), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const row = result.rows[0];
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const user = {
      id: row.id,
      email: row.email,
      tier: row.tier,
      trialSessionsLeft: row.trial_sessions_left
    };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, tier, trial_sessions_left, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({
      id: row.id,
      email: row.email,
      tier: row.tier,
      trialSessionsLeft: row.trial_sessions_left,
      createdAt: row.created_at
    });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─── Disposable email domains (basic blocklist) ───
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'trashmail.com', 'mailnesia.com', 'tempail.com',
  'fakeinbox.com', '10minutemail.com', 'getairmail.com', 'mohmal.com',
  'burnermail.io', 'temp-mail.org', 'inbox.testmail.app'
]);

function isDisposableEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}

// ─── Email Verification ───
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/api/auth/send-code', rateLimiter(3, 300000), async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }
  if (isDisposableEmail(email)) {
    return res.status(400).json({ error: 'Используйте реальный email, а не одноразовый' });
  }

  try {
    // Check if already registered
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Delete old codes for this email
    await pool.query('DELETE FROM email_codes WHERE email = $1', [email]);
    // Insert new code
    await pool.query(
      'INSERT INTO email_codes (email, code, expires_at) VALUES ($1, $2, $3)',
      [email, code, expiresAt]
    );

    // Send email via Resend
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: 'Код подтверждения — TherapyVoid',
        html: `
          <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:40px 20px;text-align:center;">
            <h2 style="color:#166088;">TherapyVoid</h2>
            <p style="color:#666;font-size:16px;">Ваш код подтверждения:</p>
            <div style="background:#f5f7fa;border-radius:12px;padding:20px;margin:20px 0;">
              <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#343a40;">${code}</span>
            </div>
            <p style="color:#999;font-size:14px;">Код действителен 10 минут.</p>
            <p style="color:#999;font-size:12px;margin-top:30px;">Если вы не запрашивали код — игнорируйте это письмо.</p>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
      return res.status(500).json({ error: 'Не удалось отправить код. Попробуйте позже.' });
    }

    res.json({ success: true, message: 'Код отправлен на ' + email });
  } catch (err) {
    console.error('Send code error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/auth/verify', rateLimiter(10, 300000), async (req, res) => {
  const { email, code, password, trialId } = req.body;
  if (!email || !code || !password) {
    return res.status(400).json({ error: 'Email, код и пароль обязательны' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  }

  try {
    // Verify code
    const codeResult = await pool.query(
      'SELECT * FROM email_codes WHERE email = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()',
      [email, code]
    );
    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Неверный или истёкший код' });
    }

    // Mark code as used
    await pool.query('UPDATE email_codes SET used = TRUE WHERE id = $1', [codeResult.rows[0].id]);

    // Create user
    const hash = bcrypt.hashSync(password, 10);
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, tier, trial_sessions_left',
      [email, hash]
    );
    const newUser = userResult.rows[0];

    // If trialId exists, migrate trial data to user
    if (trialId) {
      try {
        const trialResult = await pool.query(
          'SELECT history FROM trial_sessions WHERE trial_id = $1',
          [trialId]
        );
        if (trialResult.rows.length > 0 && trialResult.rows[0].history) {
          // Store trial results if any
          const trialHistory = trialResult.rows[0].history;
          if (trialHistory.length > 0) {
            // Link any saved results to this user
            await pool.query(
              'UPDATE results SET user_id = $1 WHERE user_id IS NULL AND created_at > NOW() - INTERVAL \'1 hour\'',
              [newUser.id]
            );
          }
        }
        // Delete trial session
        await pool.query('DELETE FROM trial_sessions WHERE trial_id = $1', [trialId]);
      } catch (migErr) {
        console.error('Trial migration error:', migErr.message);
      }
    }

    const user = {
      id: newUser.id,
      email: newUser.email,
      tier: newUser.tier,
      trialSessionsLeft: newUser.trial_sessions_left
    };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─── Anonymous Trial Chat ───
app.post('/api/chat-trial', rateLimiter(20, 60000), async (req, res) => {
  const { message, history, mode, trialId } = req.body;
  if (!message || !trialId) {
    return res.status(400).json({ error: 'Сообщение и trialId обязательны' });
  }

  const selectedPrompt = PROMPTS[mode] || GESTALT_PROMPT;

  try {
    // Get or create trial session
    let trial = await pool.query(
      'SELECT * FROM trial_sessions WHERE trial_id = $1',
      [trialId]
    );

    if (trial.rows.length === 0) {
      await pool.query(
        'INSERT INTO trial_sessions (trial_id, message_count, history) VALUES ($1, 0, $2)',
        [trialId, JSON.stringify([])]
      );
      trial = await pool.query('SELECT * FROM trial_sessions WHERE trial_id = $1', [trialId]);
    }

    const trialData = trial.rows[0];

    if (trialData.message_count >= trialData.max_messages) {
      return res.status(402).json({
        error: 'Пробные сообщения закончились',
        code: 'TRIAL_EXHAUSTED',
        message: 'Вы использовали 5 бесплатных сообщений. Зарегистрируйтесь, чтобы получить ещё 6!'
      });
    }

    // Guard check
    try {
      const guardRes = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: GUARD_PROMPT },
            { role: 'user', content: message }
          ],
          max_tokens: 3,
          temperature: 0
        })
      });

      if (guardRes.ok) {
        const guardData = await guardRes.json();
        const verdict = (guardData.choices?.[0]?.message?.content || '').trim().toUpperCase();
        if (verdict === 'NO') {
          return res.json({
            reply: 'Я здесь только для психотерапевтических бесед. Если у вас есть запрос, связанный с чувствами, переживаниями или отношениями — я рядом.',
            model: 'deepseek-v4-flash',
            rejected: true,
            trialLeft: trialData.max_messages - trialData.message_count
          });
        }
      }
    } catch (_) { /* guard failed, proceed */ }

    // Call DeepSeek
    const messages = [
      { role: 'system', content: selectedPrompt },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: message }
    ];

    const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('DeepSeek API error:', response.status, err);
      return res.status(502).json({ error: 'Ошибка AI-сервера, попробуйте позже' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '...';

    // Update trial session
    const newCount = trialData.message_count + 1;
    const updatedHistory = [
      ...(Array.isArray(trialData.history) ? trialData.history : []),
      { role: 'user', content: message },
      { role: 'assistant', content: reply }
    ];

    await pool.query(
      'UPDATE trial_sessions SET message_count = $1, history = $2 WHERE trial_id = $3',
      [newCount, JSON.stringify(updatedHistory), trialId]
    );

    res.json({
      reply,
      model: 'deepseek-v4-flash',
      trialLeft: trialData.max_messages - newCount
    });
  } catch (err) {
    console.error('Trial chat error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ─── Session Analysis (mini) ───
app.post('/api/session-analysis', rateLimiter(5, 300000), async (req, res) => {
  const { history, mode, trialId } = req.body;
  if (!history || !Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: 'История чата обязательна' });
  }

  try {
    const analysisPrompt = `Ты — психолог-аналитик. Проанализируй эту терапевтическую сессию кратко.

Формат ответа (строго JSON):
{
  "themes": ["тема1", "тема2"],
  "pattern": "Основной эмоциональный паттерн (1-2 предложения)",
  "recommendation": "Одна конкретная рекомендация (1-2 предложения)",
  "preview": "Краткое резюме сессии (2-3 предложения для превью)"
}

Ответи ТОЛЬКО валидным JSON, без markdown.`;

    const messages = [
      { role: 'system', content: analysisPrompt },
      ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
    ];

    const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages,
        max_tokens: 512,
        temperature: 0.5
      })
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Ошибка AI-сервера' });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';

    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch {
      // If JSON parsing fails, create a basic response
      analysis = {
        themes: [],
        pattern: raw.slice(0, 200),
        recommendation: '',
        preview: raw.slice(0, 300)
      };
    }

    res.json({ analysis });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Ошибка анализа' });
  }
});

// ─── Chat Route (AI-терапевт) ───
app.post('/api/chat', authMiddleware, rateLimiter(30, 60000), async (req, res) => {
  const { message, history, mode } = req.body;
  if (!message) return res.status(400).json({ error: 'Сообщение обязательно' });
  const selectedPrompt = PROMPTS[mode] || GESTALT_PROMPT;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    let model;
    if (user.tier === 'pro') {
      model = 'deepseek-v4-flash';
    } else {
      if (user.trial_sessions_left <= 0) {
        return res.status(402).json({
          error: 'Пробные сессии закончились',
          code: 'TRIAL_EXHAUSTED',
          message: 'Вы использовали все 6 пробных сообщений. Чтобы продолжить, обновите тариф до Pro.'
        });
      }
      model = 'deepseek-v4-flash';
    }

    // ─── Guard: проверяем, психологический ли запрос ───
    try {
      const guardRes = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: GUARD_PROMPT },
            { role: 'user', content: message }
          ],
          max_tokens: 3,
          temperature: 0
        })
      });

      if (guardRes.ok) {
        const guardData = await guardRes.json();
        const verdict = (guardData.choices?.[0]?.message?.content || '').trim().toUpperCase();
        if (verdict === 'NO') {
          return res.json({
            reply: 'Я здесь только для психотерапевтических бесед. Если у вас есть запрос, связанный с чувствами, переживаниями или отношениями — я рядом.',
            model,
            rejected: true,
            trialSessionsLeft: user.tier === 'free' ? user.trial_sessions_left : null
          });
        }
      }
    } catch (_) { /* guard failed, proceed anyway */ }

    // ─── Основной запрос к терапевту ───
    const messages = [
      { role: 'system', content: selectedPrompt },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: message }
    ];

    const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('DeepSeek API error:', response.status, err);
      return res.status(502).json({ error: 'Ошибка AI-сервера, попробуйте позже' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '...';

    if (user.tier === 'free') {
      await pool.query(
        'UPDATE users SET trial_sessions_left = trial_sessions_left - 1 WHERE id = $1',
        [user.id]
      );
    }

    await pool.query('INSERT INTO chat_sessions (user_id) VALUES ($1)', [user.id]);

    res.json({
      reply,
      model,
      trialSessionsLeft: user.tier === 'free' ? user.trial_sessions_left - 1 : null
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ─── Results Routes ───
app.post('/api/results', optionalAuth, async (req, res) => {
  const { scores, hero, schoolCode } = req.body;
  if (!scores || !hero) {
    return res.status(400).json({ error: 'scores и hero обязательны' });
  }

  try {
    const userId = req.user?.id || null;
    const result = await pool.query(
      'INSERT INTO results (user_id, scores, hero, school_code) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, JSON.stringify(scores), hero, schoolCode || null]
    );

    res.status(201).json({
      id: result.rows[0].id,
      saved: true,
      linkedToAccount: !!userId
    });
  } catch (err) {
    console.error('Results save error:', err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const total = (await pool.query('SELECT COUNT(*) as count FROM results')).rows[0].count;
    const heroes = (await pool.query(
      'SELECT hero, COUNT(*) as count FROM results GROUP BY hero ORDER BY count DESC'
    )).rows;
    const bySchool = (await pool.query(
      'SELECT school_code, COUNT(*) as count FROM results WHERE school_code IS NOT NULL GROUP BY school_code ORDER BY count DESC'
    )).rows;

    res.json({ total, heroes, bySchool });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ─── Health ───
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.json({ status: 'ok', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// ─── Page Routes ───
app.get('/auth', (req, res) => res.sendFile(path.join(__dirname, 'auth.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/tos', (req, res) => res.sendFile(path.join(__dirname, 'tos.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));

// ─── Start ───
app.listen(PORT, () => {
  console.log(`Therapy Funnel API → http://localhost:${PORT}`);
  console.log(`  POST /api/auth/register`);
  console.log(`  POST /api/auth/login`);
  console.log(`  GET  /api/auth/me`);
  console.log(`  POST /api/chat      (AI-терапевт)`);
  console.log(`  POST /api/results`);
  console.log(`  GET  /api/stats`);
  console.log(`  GET  /api/health`);
});

module.exports = app;
