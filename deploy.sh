#!/bin/bash

# Therapy Funnel Deployment Script
# Usage: bash deploy.sh [github-repo-url]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Therapy Funnel Deployment Script${NC}"
echo "========================================"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: Git is not installed. Please install git first.${NC}"
    exit 1
fi

# Get repo URL from argument or prompt
if [ -n "$1" ]; then
    REPO_URL="$1"
else
    echo -e "${YELLOW}Enter your GitHub repository URL (e.g., https://github.com/username/therapy-funnel.git):${NC}"
    read -r REPO_URL
fi

if [ -z "$REPO_URL" ]; then
    echo -e "${RED}Error: Repository URL is required.${NC}"
    exit 1
fi

# Extract repo name from URL
REPO_NAME=$(basename "$REPO_URL" .git)

echo ""
echo -e "${GREEN}📦 Preparing to deploy:${NC}"
echo "  Repository: $REPO_URL"
echo "  Local directory: $(pwd)"
echo ""

# Initialize git if not already
if [ ! -d .git ]; then
    echo -e "${YELLOW}Initializing git repository...${NC}"
    git init
else
    echo -e "${YELLOW}Git repository already initialized.${NC}"
fi

# Check if remote exists
if git remote | grep -q origin; then
    echo -e "${YELLOW}Updating existing remote 'origin'...${NC}"
    git remote set-url origin "$REPO_URL"
else
    echo -e "${YELLOW}Adding remote 'origin'...${NC}"
    git remote add origin "$REPO_URL"
fi

# Add all files
echo -e "${YELLOW}Adding files to git...${NC}"
git add .

# Commit
echo -e "${YELLOW}Committing changes...${NC}"
git commit -m "Deploy Therapy Funnel v1.0" || {
    echo -e "${YELLOW}No changes to commit.${NC}"
}

# Push to GitHub
echo -e "${YELLOW}Pushing to GitHub...${NC}"
git branch -M main
git push -u origin main --force

echo ""
echo -e "${GREEN}✅ Successfully deployed to GitHub!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Go to: https://github.com/$(echo "$REPO_URL" | sed 's|.*github.com/||' | sed 's|\.git$||')"
echo "2. Settings → Pages"
echo "3. Set 'Source' to 'Deploy from a branch'"
echo "4. Set 'Branch' to 'main', folder to '/ (root)'"
echo "5. Save and wait 1-2 minutes"
echo ""
echo -e "${GREEN}Your site will be available at:${NC}"
echo "https://$(echo "$REPO_URL" | sed 's|.*github.com/||' | sed 's|/.*||').github.io/$REPO_NAME"
echo ""
echo -e "${YELLOW}Alternative deployment options:${NC}"
echo "- Vercel: https://vercel.com/new (import git repo)"
echo "- Netlify: https://app.netlify.com/start (import git repo)"
echo "- Local: npx serve . (for testing)"
echo ""

# Create a simple test
echo -e "${YELLOW}Testing local deployment...${NC}"
if command -v python3 &> /dev/null; then
    echo "To test locally, run: python3 -m http.server 8000"
    echo "Then open: http://localhost:8000"
elif command -v npx &> /dev/null; then
    echo "To test locally, run: npx serve ."
else
    echo "To test locally, open index.html in your browser"
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"