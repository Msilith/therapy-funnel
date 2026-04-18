#!/bin/bash

# Upload Therapy Funnel to GitHub with authentication
# This script helps you upload the project to GitHub safely

set -e

echo "🔐 GitHub Upload Script for Therapy Funnel"
echo "=========================================="
echo ""
echo "This script will help you upload the project to GitHub."
echo "We'll use GitHub CLI or Personal Access Token for security."
echo ""

# Check for GitHub CLI
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI is installed."
    echo "Using GitHub CLI for authentication..."
    
    # Check if already authenticated
    if gh auth status &> /dev/null; then
        echo "✅ Already authenticated with GitHub CLI."
    else
        echo "🔑 Please authenticate with GitHub CLI:"
        gh auth login
    fi
    
    # Create repo and push
    echo "📦 Creating repository..."
    gh repo create therapy-funnel --public --source=. --remote=origin --push
    
    echo ""
    echo "✅ Repository created and pushed!"
    echo "🌐 URL: https://github.com/$(gh api user --jq .login)/therapy-funnel"
    
else
    echo "⚠️ GitHub CLI is not installed."
    echo ""
    echo "Method 1: Install GitHub CLI (recommended)"
    echo "  brew install gh  # macOS"
    echo "  Then run this script again"
    echo ""
    echo "Method 2: Use Personal Access Token"
    echo ""
    
    # Ask for token
    echo "🔑 To get a Personal Access Token:"
    echo "1. Go to: https://github.com/settings/tokens"
    echo "2. Click 'Generate new token' → 'Generate new token (classic)'"
    echo "3. Give it a name: 'Therapy Funnel Upload'"
    echo "4. Select scopes: 'repo' (full control of private repositories)"
    echo "5. Click 'Generate token'"
    echo "6. COPY THE TOKEN (you'll only see it once!)"
    echo ""
    
    read -p "Have you created a token? (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📝 Paste your token here (hidden input):"
        read -rs TOKEN
        echo ""
        
        if [ -z "$TOKEN" ]; then
            echo "❌ Token cannot be empty."
            exit 1
        fi
        
        # GitHub username
        echo "👤 Enter your GitHub username:"
        read USERNAME
        
        # Create repo via API
        echo "📦 Creating repository..."
        curl -X POST \
          -H "Authorization: token $TOKEN" \
          -H "Accept: application/vnd.github.v3+json" \
          https://api.github.com/user/repos \
          -d '{"name":"therapy-funnel","description":"Interactive therapy assessment web funnel","private":false}'
        
        # Initialize and push
        echo "🚀 Pushing code..."
        git init
        git add .
        git commit -m "Initial commit: Therapy Funnel v1.0"
        git branch -M main
        git remote add origin "https://${USERNAME}:${TOKEN}@github.com/${USERNAME}/therapy-funnel.git"
        git push -u origin main
        
        # Clear token from memory
        TOKEN=""
        USERNAME=""
        
        echo ""
        echo "✅ Repository created and pushed!"
        echo "🌐 URL: https://github.com/YOUR-USERNAME/therapy-funnel"
        echo ""
        echo "⚠️ Important: Your token was used temporarily and not stored."
        echo "You may want to delete or restrict the token now."
        
    else
        echo "❌ Please create a token first."
        echo "Run this script again after creating the token."
        exit 1
    fi
fi

echo ""
echo "🎉 Next steps:"
echo "1. Enable GitHub Pages:"
echo "   Settings → Pages → Source: 'Deploy from a branch' → Branch: main, folder: /"
echo "2. Wait 1-2 minutes"
echo "3. Your site will be at: https://YOUR-USERNAME.github.io/therapy-funnel"
echo ""
echo "📚 More info in DEPLOY.md"