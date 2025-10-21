#!/bin/bash

# Proxilion Setup Script
# This script helps you get started with Proxilion quickly

set -e

echo "🛡️  Proxilion Setup"
echo "===================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if pnpm is installed, if not offer to install
if ! command -v pnpm &> /dev/null; then
    echo "📦 pnpm is not installed."
    read -p "Would you like to install pnpm? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm install -g pnpm
        echo "✅ pnpm installed"
    else
        echo "⚠️  Continuing with npm instead"
        PACKAGE_MANAGER="npm"
    fi
else
    echo "✅ pnpm detected"
    PACKAGE_MANAGER="pnpm"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
    pnpm install
else
    npm install
fi

echo "✅ Dependencies installed"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your configuration."
else
    echo "✅ .env file already exists"
fi

# Build the project
echo ""
echo "🔨 Building project..."
if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
    pnpm build
else
    npm run build
fi

echo "✅ Build complete"

# Run tests
echo ""
read -p "Would you like to run tests? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧪 Running tests..."
    if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
        pnpm test
    else
        npm test
    fi
    echo "✅ Tests passed"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env file with your configuration"
echo "  2. Run 'pnpm dev' to start development server"
echo "  3. Visit http://localhost:8787/health to check status"
echo "  4. Read docs/DEPLOYMENT.md for production deployment"
echo ""
echo "Quick commands:"
echo "  pnpm dev          - Start development server"
echo "  pnpm build        - Build for production"
echo "  pnpm test         - Run tests"
echo "  pnpm lint         - Lint code"
echo "  pnpm deploy       - Deploy to Cloudflare Workers"
echo ""
echo "Documentation:"
echo "  README.md              - Getting started guide"
echo "  docs/ARCHITECTURE.md   - Architecture overview"
echo "  docs/DEPLOYMENT.md     - Deployment guide"
echo "  CONTRIBUTING.md        - Contributing guidelines"
echo ""
echo "Happy securing! 🛡️"

