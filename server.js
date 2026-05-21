// © 2025–2026 Ssilith. Proprietary. All rights reserved. Commercial use requires royalties. See LICENSE.
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'therapy-funnel-dev-secret-change-me';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-ba29207a867645c3845a8ec3f1a4c431';
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// SQLite setup
const db = new Database('database.sqlite');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    tier TEXT DEFAULT 'free',
    trial_sessions_left INTEGER DEFAULT 3,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    scores TEXT,
    hero TEXT,
    school_code TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

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

Ты НЕ ДОЛЖЕН:
- Давать интерпретации («У тебя детская травма»).
- Вести в прошлое без запроса клиента.
- Предлагать медицинские диагнозы или лекарства.
- При признаках кризиса (суицидальные мысли, психоз) — скажи: «То, что ты описываешь, требует помощи живого специалиста. Пожалуйста, обратись к психотерапевту или в службу доверия (112 в России, 988 в США)».`;

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

// Optional auth — прикрепляет user если токен есть, но не блокирует
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
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 4) {
    return res.status(400).json({ error: 'Email и пароль (мин 4 символа) обязательны' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)'
  ).run(email, hash);

  const user = { id: result.lastInsertRowid, email, tier: 'free', trialSessionsLeft: 3 };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id, email, tier, trial_sessions_left, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({
    id: row.id,
    email: row.email,
    tier: row.tier,
    trialSessionsLeft: row.trial_sessions_left,
    createdAt: row.created_at
  });
});

// ─── Chat Route (AI-терапевт) ───
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Сообщение обязательно' });

  // Проверяем пользователя
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  // Определяем модель и проверяем лимиты
  let model;
  if (user.tier === 'pro') {
    model = 'deepseek-v4-pro';
  } else {
    if (user.trial_sessions_left <= 0) {
      return res.status(402).json({
        error: 'Пробные сессии закончились',
        code: 'TRIAL_EXHAUSTED',
        message: 'Вы использовали все 3 пробные сессии. Чтобы продолжить, обновите тариф до Pro.'
      });
    }
    model = 'deepseek-chat';
  }

  // Строим сообщения для DeepSeek
  const messages = [
    { role: 'system', content: GESTALT_PROMPT },
    ...(Array.isArray(history) ? history : []),
    { role: 'user', content: message }
  ];

  try {
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

    // Списываем пробную сессию для free-пользователей
    if (user.tier === 'free') {
      db.prepare('UPDATE users SET trial_sessions_left = trial_sessions_left - 1 WHERE id = ?').run(user.id);
    }

    // Логируем сессию
    db.prepare('INSERT INTO chat_sessions (user_id) VALUES (?)').run(user.id);

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
app.post('/api/results', optionalAuth, (req, res) => {
  const { scores, hero, schoolCode } = req.body;
  if (!scores || !hero) {
    return res.status(400).json({ error: 'scores и hero обязательны' });
  }

  const userId = req.user?.id || null;
  const result = db.prepare(
    'INSERT INTO results (user_id, scores, hero, school_code) VALUES (?, ?, ?, ?)'
  ).run(userId, JSON.stringify(scores), hero, schoolCode || null);

  res.status(201).json({
    id: result.lastInsertRowid,
    saved: true,
    linkedToAccount: !!userId
  });
});

app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM results').get().count;
  const heroes = db.prepare(
    'SELECT hero, COUNT(*) as count FROM results GROUP BY hero ORDER BY count DESC'
  ).all();
  const bySchool = db.prepare(
    'SELECT school_code, COUNT(*) as count FROM results WHERE school_code IS NOT NULL GROUP BY school_code ORDER BY count DESC'
  ).all();

  res.json({ total, heroes, bySchool });
});

// ─── Health ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Page Routes (clean URLs) ───
app.get('/auth', (req, res) => res.sendFile(path.join(__dirname, 'auth.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));

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
