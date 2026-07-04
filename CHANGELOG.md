# TherapyVoid — Версии и чейнджлог

---

## v2.6.1 (05.07.2026)

### Done
- [x] Фикс: GitHub Pages кеш (добавлен cache-busting ?v=2)
- [x] Фикс: БД дефолт trial_sessions_left изменён с 3 на 6
- [x] Фикс: home.html блок «Как это работает» расширен на всю ширину

---

## v2.6.0 (05.07.2026)

### Done
- [x] Два опросника: быстрый (5 вопросов) и полный (15 вопросов)
- [x] Предстраница выбора формата
- [x] Расширен пул вопросов до 15 (добавлены: критика, отношения, забота о теле, прошлое, будущее, одиночество, опора)
- [x] i18n для предстраницы (selector)
- [x] Кнопка «Назад к выбору формата»
- [x] home.html полностью переведён на EN
- [x] Обновлён подзаголовок: «Ответь на вопросы и познай тайны своей души»

---

## v2.5.0 (04.07.2026)

### Done
- [x] Замена иконки (sigil → main icon) во всех HTML-файлах
- [x] Фикс шуфлинга: вопросы больше не перетасовываются при смене языка mid-test
- [x] Навбар i18n: chat.html, home.html, auth.html — навигация переводится по языку
- [x] Анонимный триал: 5 сообщений без регистрации (/api/chat-trial)
- [x] Регистрация с верификацией email (Resend API, 6-значный код)
- [x] 2-шаговая форма регистрации (email → код + пароль)
- [x] Мини-анализ сессии после 11 сообщений (/api/session-analysis)
- [x] Модалка «Зарегистрируйтесь» после исчерпания триала
- [x] Перенос данных триала при регистрации (trial_id)
- [x] Сохранение истории чата при редиректе на регистрацию
- [x] Документация (CHANGELOG.md, RESOURCES.md)
- [x] Новые DB таблицы: trial_sessions, email_codes
- [x] Resend домен therapyvoid.com верифицирован

---

## v2.4.1 (22.05.2026) — Security Cleanup

- Старый ключ DeepSeek `sk-ba29...` засвечен в git-истории
- Убран из `server.js` → всё в `process.env.*`
- Новый ключ в Render env vars, локальном `.env`, `models.json`
- Старый ключ отозван на platform.deepseek.com

---

## v2.4.0 (22.05.2026)

- Cloudflare grey cloud (прокси отключён из-за конфликта с Fastly)
- Concurrent limiter (макс 10 одновременных запросов)
- Все креды собраны в SKILL.md

---

## v2.3.0 (22.05.2026)

- 6 режимов AI-чата: КПТ, Психоанализ, Гештальт, Экзистенциализм, Христианство, Ислам
- Скиллы-промпты для каждой школы в `server.js`
- Guard-классификатор (проверка YES/NO перед каждым сообщением)

---

## v2.2.0 (21.05.2026)

- `home.html` — вики-страница с описанием подходов
- 7 школ (добавлены S — Самопомощь, X — Христианство, I — Ислам)
- Рандомизация порядка вопросов и вариантов ответов

---

## v2.1.0 (21.05.2026)

- i18n RU/EN (locales/ru.json, locales/en.json)
- Neon PostgreSQL (миграция с SQLite)
- Render деплой

---

## v2.0.0 (21.05.2026)

- Домен therapyvoid.com
- GitHub Pages для фронтенда
- Разделение фронт/бэкенд

---

## v1.0.0 (20.05.2026) — MVP

- Тест из 10 вопросов (гештальт)
- Гештальт-чат (один режим)
- SQLite база данных
- Локальный запуск

---

## Известные баги

| ID | Описание | Статус |
|----|----------|--------|
| BUG-001 | GitHub Pages кеширует долго | Workaround (?v=2) |
| BUG-002 | auth.html формы не переведены на EN | Open |
| BUG-003 | api.therapyvoid.com не работает | Won't fix |
| BUG-004 | Render засыпает после 15 мин | Won't fix |
| BUG-005 | Neon Console заблокирована из РФ | Won't fix |

---

## Стек

| Компонент | Технология |
|-----------|------------|
| Фронтенд | Vanilla HTML/CSS/JS (GitHub Pages) |
| Бэкенд | Express.js (Render Free) |
| БД | Neon PostgreSQL (Free tier) |
| AI | DeepSeek V4 Flash |
| Email | Resend (3000 писем/мес) |
| DNS | Cloudflare |
| Домен | Cloudflare Registrar ($10/год) |

---

## Env vars для Render

```
NODE_ENV=production
PORT=10000
JWT_SECRET=tv-dragon-sigil-2026-secure-jwt-key-change-me
DEEPSEEK_API_KEY=<в Render env vars>
DATABASE_URL=postgresql://neondb_owner:npg_3RSV0dHPFDxr@ep-wispy-fog-ajr3efpi-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require
RESEND_API_KEY=re_7CPm7vCX_LpuLM1BsCzRjCUsb7HzJXpVq
FROM_EMAIL=TherapyVoid <noreply@therapyvoid.com>
```
