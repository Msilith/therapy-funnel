#!/bin/bash
# Добавляет agent-browser и skill-discovery
# Запуск: bash ~/Downloads/add-browser-and-discovery.sh

set -e
SKILLS_DIR="$HOME/.pi/agent/skills"

echo "=== 1/2 Agent Browser ==="
mkdir -p "$SKILLS_DIR/agent-browser"
cat > "$SKILLS_DIR/agent-browser/SKILL.md" << 'EOF'
---
name: agent-browser
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
---

# Browser Automation with agent-browser

## Installation

```bash
npm install -g agent-browser
agent-browser install  # Download Chromium
```

## Quick Start

```bash
agent-browser open <url>        # Navigate to page
agent-browser snapshot -i       # Get interactive elements with refs
agent-browser click @e1         # Click element by ref
agent-browser fill @e2 "text"   # Fill input by ref
agent-browser close             # Close browser
```

## Core Workflow

1. Navigate: `agent-browser open <url>`
2. Snapshot: `agent-browser snapshot -i` (returns elements with refs like @e1, @e2)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes
EOF

cat > "$SKILLS_DIR/agent-browser/README.md" << 'EOF'
# Зачем agent-browser

Управление браузером из терминала. Pi может открывать страницы,
кликать кнопки, заполнять формы, делать скриншоты — без GUI.

Когда нужен:
- Парсинг сайтов (достать данные со страницы)
- Автотесты UI (проверить что форма работает)
- Скриншоты для отчётов
- Заполнение форм автоматически

Пример — залогиниться на сайт:
  agent-browser open https://mysite.com/login
  agent-browser snapshot -i          # найти поля
  agent-browser fill @e1 "user"      # логин
  agent-browser fill @e2 "pass"      # пароль
  agent-browser click @e3            # кнопка "Войти"
  agent-browser screenshot           # скриншот

Установка (одноразово):
  npm install -g agent-browser
  agent-browser install
EOF
echo "  OK"

echo ""
echo "=== 2/2 Skill Discovery ==="
mkdir -p "$SKILLS_DIR/skill-discovery"
cat > "$SKILLS_DIR/skill-discovery/SKILL.md" << 'EOF'
---
name: skill-discovery
description: Discover agent skills on GitHub. Use when user asks to find new skills, search for skills, explore skill repositories, or wants to see trending/popular skills.
---

# Skill Discovery

Find agent skills on GitHub via API.

## Search by topic

```bash
curl -s "https://api.github.com/search/repositories?q=topic:claude-skills+topic:agent-skills&sort=stars&per_page=30" | python3 -c "import sys,json; [print(f'{r[\"stargazers_count\"]:>5} {r[\"full_name\"]} — {r.get(\"description\",\"\")}') for r in json.load(sys.stdin)['items']]"
```

## Search by keyword

```bash
curl -s "https://api.github.com/search/repositories?q=SKILL.md+in:path+<KEYWORD>&sort=stars&per_page=20"
```

## Install a skill

```bash
mkdir -p ~/.pi/agent/skills/<name>
curl -s "https://raw.githubusercontent.com/<owner>/<repo>/main/SKILL.md" > ~/.pi/agent/skills/<name>/SKILL.md
```
EOF
echo "  OK"

echo ""
echo "Готово. Скиллы:"
ls -1 "$SKILLS_DIR/"
