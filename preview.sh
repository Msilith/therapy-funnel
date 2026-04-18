#!/bin/bash

# Скрипт для локального предпросмотра изменений
# Запускает веб-сервер и открывает браузер

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}👁️  Локальный предпросмотр Therapy Funnel${NC}"
echo "==========================================="

# Проверяем установлен ли npx
if ! command -v npx &> /dev/null; then
    echo -e "${YELLOW}⚠️  npx не установлен. Открываю index.html напрямую...${NC}"
    open index.html
    echo -e "${GREEN}✅ Браузер открыт с файлом index.html${NC}"
    echo "Для обновления перезагрузи страницу (Cmd+R)"
    exit 0
fi

# Запускаем сервер в фоне
echo -e "${YELLOW}🚀 Запускаю локальный сервер...${NC}"
echo "Сервер будет доступен по адресу:"
echo -e "${GREEN}http://localhost:3000${NC}"
echo ""
echo -e "${YELLOW}📋 Команды:${NC}"
echo "• Перезагрузить страницу: Cmd+R или F5"
echo "• Остановить сервер: Ctrl+C"
echo "• Проверить консоль браузера: F12 → Console"
echo ""

# Проверяем изменения в файлах
echo -e "${YELLOW}📝 Последние изменения:${NC}"
git diff --stat 2>/dev/null || echo "Не git репозиторий или нет изменений"

echo ""
echo -e "${GREEN}🌐 Открываю браузер...${NC}"
open http://localhost:3000 2>/dev/null || echo "Открой браузер вручную: http://localhost:3000"

echo ""
echo -e "${YELLOW}⚙️  Запуск сервера...${NC}"
echo "Для выхода нажми Ctrl+C"
echo ""

# Запускаем сервер
npx serve . -p 3000