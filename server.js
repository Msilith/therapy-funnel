// © 2025–2026 Ssilith. Proprietary. All rights reserved. Commercial use requires royalties. See LICENSE.
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/therapyfunnel';
const JWT_SECRET = process.env.JWT_SECRET || 'therapy-funnel-dev-secret-change-me';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-ba29207a867645c3845a8ec3f1a4c431';
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';

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
        trial_sessions_left INTEGER DEFAULT 3,
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
    `);
    console.log('✓ PostgreSQL tables ready');
  } finally {
    client.release();
  }
}

initDB().catch(err => {
  console.error('DB init error:', err);
  process.exit(1);
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

    const user = { id: result.rows[0].id, email, tier: 'free', trialSessionsLeft: 3 };
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

// ─── Chat Route (AI-терапевт) ───
app.post('/api/chat', authMiddleware, rateLimiter(30, 60000), async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Сообщение обязательно' });

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
          message: 'Вы использовали все 3 пробные сессии. Чтобы продолжить, обновите тариф до Pro.'
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
      { role: 'system', content: GESTALT_PROMPT },
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
