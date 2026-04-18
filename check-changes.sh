#!/bin/bash

# Скрипт для проверки изменений перед коммитом
# Использование: bash check-changes.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔍 Проверка изменений перед коммитом${NC}"
echo "======================================"

# 1. Показываем статус git
echo -e "${YELLOW}📊 Статус git:${NC}"
git status

echo ""
echo -e "${YELLOW}📝 Изменения в файлах:${NC}"

# 2. Показываем diff для каждого изменённого файла
changed_files=$(git diff --name-only)

if [ -z "$changed_files" ]; then
    echo "Нет изменений для коммита."
    exit 0
fi

for file in $changed_files; do
    echo ""
    echo -e "${GREEN}📄 Файл: $file${NC}"
    echo "--------------------------------------"
    git diff --color=always "$file" | head -50
    echo "..."
done

echo ""
echo -e "${YELLOW}🚀 Предпросмотр в браузере:${NC}"
echo "Хочешь проверить изменения в браузере?"
echo "1. Открыть index.html:           open index.html"
echo "2. Запустить локальный сервер:   npx serve ."
echo ""
echo -e "${YELLOW}📦 Команды для коммита:${NC}"
echo "Добавить все изменения:          git add ."
echo "Добавить конкретный файл:        git add index.html"
echo "Создать коммит:                  git commit -m 'Твоё сообщение'"
echo "Отправить на GitHub:             git push"
echo ""
echo -e "${YELLOW}⚠️  Отмена изменений:${NC}"
echo "Отменить изменения в файле:      git checkout -- index.html"
echo "Убрать файл из staged:           git reset HEAD index.html"
echo ""

# 3. Спрашиваем хочет ли пользователь создать коммит
read -p "Хочешь создать коммит сейчас? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Введи сообщение коммита:${NC}"
    read commit_message
    
    if [ -z "$commit_message" ]; then
        commit_message="Обновление $(date '+%Y-%m-%d %H:%M')"
    fi
    
    git add .
    git commit -m "$commit_message"
    
    echo ""
    echo -e "${GREEN}✅ Коммит создан!${NC}"
    echo "Хочешь отправить на GitHub? (y/n):"
    read -n 1 -r push_reply
    
    if [[ $push_reply =~ ^[Yy]$ ]]; then
        git push
        echo -e "${GREEN}✅ Изменения отправлены на GitHub!${NC}"
    else
        echo -e "${YELLOW}⚠️  Коммит сохранён локально. Отправить позже: git push${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Изменения не закоммичены. Проверяй дальше.${NC}"
fi

echo ""
echo -e "${GREEN}🎯 Готово! Файлы остались в рабочей директории.${NC}"