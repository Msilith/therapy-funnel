# 🚀 Как выложить Therapy Funnel в интернет

Куда залить, как настроить, что делать если что-то пошло не так.

## Вариант 1: GitHub Pages (проще всего)

### Создаём репозиторий
1. Зайдите на GitHub.
2. Нажмите «+» → «New repository».
3. Название: `therapy-funnel`.
4. Описание можно оставить пустым или написать что-то вроде «Тест для подбора терапии».
5. Выберите «Public» или «Private» — как вам удобнее.
6. **Не добавляйте README, .gitignore или license** — эти файлы у вас уже есть.

### Заливаем код
```bash
# Перейдите в папку с проектом
cd ~/Downloads/therapy-funnel

# Инициализируем git
git init
git add .
git commit -m "Первый коммит: Therapy Funnel"

# Подключаем удалённый репозиторий
git remote add origin https://github.com/ВАШ-ЛОГИН/therapy-funnel.git

# Пушим
git branch -M main
git push -u origin main
```

### Включаем GitHub Pages
1. Откройте репозиторий на GitHub.
2. Settings → Pages.
3. В разделе «Source» выберите «Deploy from a branch».
4. Ветка: `main`, папка: `/ (root)`.
5. Сохраните.

Через пару минут сайт будет доступен по адресу:
`https://ВАШ-ЛОГИН.github.io/therapy-funnel`

## Вариант 2: Vercel (ещё проще)

1. Зарегистрируйтесь на [vercel.com](https://vercel.com) — можно через GitHub.
2. Нажмите «New Project».
3. Импортируйте ваш GitHub-репозиторий.
4. Настройки можно оставить как есть.
5. Жмите «Deploy».

Сайт развернётся мгновенно, SSL добавится автоматически.

## Вариант 3: Netlify

1. Зарегистрируйтесь на [netlify.com](https://netlify.com).
2. Нажмите «New site from Git».
3. Выберите GitHub → ваш репозиторий.
4. В настройках сборки:
   - Build command: (оставьте пустым)
   - Publish directory: `.`
5. «Deploy site».

## Вариант 4: Локальный сервер (чтобы посмотреть, как работает)

### Если есть Node.js
```bash
# Установите зависимости (хотя они опциональны)
npm install

# Запустите сервер
npm start
# или
npx serve .
```

Сайт откроется на `http://localhost:3000`.

### Без Node.js
Просто откройте `index.html` в браузере. Или запустите любой статический сервер:

```bash
python3 -m http.server 8000
# или
php -S localhost:8000
```

## Вариант 5: С бэкендом (если хотите собирать статистику)

Если вам интересно, сколько людей прошло тест, можно добавить простой сервер:

1. Установите Node.js (если ещё нет).
2. Установите зависимости:
   ```bash
   npm install express cors
   ```
3. Запустите сервер:
   ```bash
   node server.js
   ```
4. Сервер будет доступен на `http://localhost:3000`.

Для постоянной работы в продакшене можно использовать:
- **PM2** — чтобы сервер не падал.
- **Nginx** — как прокси.
- **Cloudflare** — для SSL и кэширования.

## 📊 Аналитика (если захотите)

### Google Analytics
Добавьте в `index.html` перед `</head>`:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=ВАШ_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'ВАШ_ID');
</script>
```

### Яндекс.Метрика
```html
<script type="text/javascript" >
   (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
   m[i].l=1*new Date();
   for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
   k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
   (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

   ym(ВАШ_СЧЁТЧИК, "init", {
        clickmap:true,
        trackLinks:true,
        accurateTrackBounce:true,
        webvisor:true
   });
</script>
```

## 🔐 Безопасность (на всякий случай)

### Для продакшена
1. **SSL/HTTPS** — сейчас все хостинги добавляют его автоматически.
2. **CORS** — если будете делать API, настройте правильно.
3. **Rate limiting** — ограничьте запросы с одного IP, если боитесь перегрузки.
4. **Защита данных** — не собирайте личную информацию.

### Конфиденциальность
- Все результаты анонимны.
- Нет сбора email, имён, IP.
- Нет cookies для отслеживания.
- Всё обрабатывается в браузере (если не включать бэкенд).

## 📱 PWA (чтобы можно было установить как приложение)

Чтобы тест можно было установить на телефон:

1. Создайте `manifest.json`:
```json
{
  "name": "Therapy Funnel",
  "short_name": "TherapyQuiz",
  "description": "Тест для подбора терапии",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f5f7fa",
  "theme_color": "#4a6fa5",
  "icons": [...]
}
```

2. Добавьте service worker в `sw.js`.
3. Зарегистрируйте в `index.html`.

## 🚨 Если что-то пошло не так

### GitHub Pages не обновляется
```bash
# Очистите кэш GitHub Pages
# Зайдите в Settings → Pages → Clear cache
# Или просто подождите 10 минут

# Локально:
git push -f origin main
```

### Сайт не загружается
- Откройте консоль браузера (F12 → Console) — посмотрите ошибки.
- Проверьте, загрузились ли все файлы.
- Убедитесь, что URL написан правильно.

### API не работает
- Убедитесь, что сервер запущен.
- Проверьте CORS-настройки.
- Посмотрите логи сервера.

## 📞 Поддержка

Если ничего не помогает:
1. Создайте Issue в репозитории.
2. Опишите, что пошло не так.
3. Или напишите на почту (если вы её указали).

---

**Удачи! 🎉**