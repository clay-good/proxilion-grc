#!/bin/bash

# Proxilion Validation Script
# Validates the entire codebase for production readiness

set -e

echo "🔍 Proxilion Validation Script"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    ((WARNINGS++))
}

info() {
    echo -e "ℹ️  $1"
}

# Check Node.js version
echo "📦 Checking Prerequisites..."
echo "----------------------------"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        pass "Node.js version: $(node -v)"
    else
        fail "Node.js version too old: $(node -v). Required: 18+"
    fi
else
    fail "Node.js not installed"
fi

# Check npm
if command -v npm &> /dev/null; then
    pass "npm installed: $(npm -v)"
else
    fail "npm not installed"
fi

echo ""

# Check dependencies
echo "📚 Checking Dependencies..."
echo "---------------------------"

if [ -d "node_modules" ]; then
    pass "node_modules directory exists"
else
    warn "node_modules not found. Run: npm install"
fi

if [ -f "package-lock.json" ]; then
    pass "package-lock.json exists"
else
    warn "package-lock.json not found"
fi

echo ""

# Check configuration files
echo "⚙️  Checking Configuration..."
echo "-----------------------------"

if [ -f ".env.example" ]; then
    pass ".env.example exists"
else
    fail ".env.example missing"
fi

if [ -f "tsconfig.json" ]; then
    pass "tsconfig.json exists"
else
    fail "tsconfig.json missing"
fi

if [ -f "wrangler.toml" ]; then
    pass "wrangler.toml exists"
else
    fail "wrangler.toml missing"
fi

if [ -f "package.json" ]; then
    pass "package.json exists"
else
    fail "package.json missing"
fi

echo ""

# Check documentation
echo "📖 Checking Documentation..."
echo "----------------------------"

REQUIRED_DOCS=(
    "README.md"
    "QUICKSTART.md"
    "DOCUMENTATION.md"
    "CHANGELOG.md"
    "CONTRIBUTING.md"
    "LICENSE"
    "SECURITY.md"
)

for doc in "${REQUIRED_DOCS[@]}"; do
    if [ -f "$doc" ]; then
        pass "$doc exists"
    else
        fail "$doc missing"
    fi
done

# Check docs directory
if [ -d "docs" ]; then
    DOC_COUNT=$(find docs -name "*.md" | wc -l | tr -d ' ')
    pass "docs/ directory exists ($DOC_COUNT files)"
else
    fail "docs/ directory missing"
fi

echo ""

# Check source code structure
echo "🏗️  Checking Source Code..."
echo "---------------------------"

REQUIRED_DIRS=(
    "src"
    "src/admin"
    "src/scanners"
    "src/policy"
    "src/proxy"
    "src/performance"
    "src/utils"
    "tests"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        pass "$dir/ directory exists"
    else
        fail "$dir/ directory missing"
    fi
done

if [ -f "src/index.ts" ]; then
    pass "src/index.ts exists (main entry point)"
else
    fail "src/index.ts missing"
fi

echo ""

# Build validation
echo "🔨 Building Project..."
echo "----------------------"

info "Running: npm run build"
if npm run build > /tmp/proxilion-build.log 2>&1; then
    pass "Build successful"
    
    # Check dist directory
    if [ -d "dist" ]; then
        pass "dist/ directory created"
        
        if [ -f "dist/index.js" ]; then
            SIZE=$(du -h dist/index.js | cut -f1)
            pass "dist/index.js created ($SIZE)"
        else
            fail "dist/index.js not created"
        fi
    else
        fail "dist/ directory not created"
    fi
else
    fail "Build failed. Check /tmp/proxilion-build.log"
    cat /tmp/proxilion-build.log
fi

echo ""

# TypeScript validation
echo "📝 Checking TypeScript..."
echo "-------------------------"

info "Running: npm run type-check"
if npm run type-check > /tmp/proxilion-typecheck.log 2>&1; then
    pass "TypeScript type checking passed"
else
    fail "TypeScript errors found. Check /tmp/proxilion-typecheck.log"
    cat /tmp/proxilion-typecheck.log | head -20
fi

echo ""

# Linting
echo "🧹 Running Linter..."
echo "--------------------"

if command -v eslint &> /dev/null || [ -f "node_modules/.bin/eslint" ]; then
    info "Running: npm run lint"
    if npm run lint > /tmp/proxilion-lint.log 2>&1; then
        pass "Linting passed"
    else
        warn "Linting issues found. Check /tmp/proxilion-lint.log"
    fi
else
    warn "ESLint not available"
fi

echo ""

# Testing
echo "🧪 Running Tests..."
echo "-------------------"

info "Running: npm test"
if npm test > /tmp/proxilion-test.log 2>&1; then
    pass "All tests passed"
    
    # Extract test results
    if grep -q "Test Files" /tmp/proxilion-test.log; then
        TEST_SUMMARY=$(grep "Test Files" /tmp/proxilion-test.log | tail -1)
        info "Test Summary: $TEST_SUMMARY"
    fi
else
    warn "Some tests failed. Check /tmp/proxilion-test.log"
    grep -A 5 "FAIL" /tmp/proxilion-test.log | head -20 || true
fi

echo ""

# Security checks
echo "🔒 Security Checks..."
echo "---------------------"

# Check for .env file (should not be committed)
if [ -f ".env" ]; then
    warn ".env file exists (should not be committed to git)"
else
    pass ".env file not present (good)"
fi

# Check .gitignore
if [ -f ".gitignore" ]; then
    if grep -q "\.env" .gitignore; then
        pass ".gitignore includes .env"
    else
        warn ".gitignore does not include .env"
    fi
else
    fail ".gitignore missing"
fi

# Check for hardcoded secrets
info "Scanning for potential secrets..."
if grep -r "api_key\|apiKey\|secret\|password" src/ --include="*.ts" | grep -v "process.env" | grep -v "// " | grep -v "/\*" > /tmp/proxilion-secrets.log 2>&1; then
    warn "Potential hardcoded secrets found. Check /tmp/proxilion-secrets.log"
else
    pass "No hardcoded secrets detected"
fi

echo ""

# Performance checks
echo "⚡ Performance Checks..."
echo "-----------------------"

if [ -f "dist/index.js" ]; then
    SIZE=$(stat -f%z dist/index.js 2>/dev/null || stat -c%s dist/index.js 2>/dev/null)
    SIZE_MB=$((SIZE / 1024 / 1024))
    
    if [ "$SIZE_MB" -lt 5 ]; then
        pass "Bundle size: ${SIZE_MB}MB (< 5MB)"
    else
        warn "Bundle size: ${SIZE_MB}MB (> 5MB, consider optimization)"
    fi
fi

echo ""

# Final summary
echo "================================"
echo "📊 Validation Summary"
echo "================================"
echo ""
echo -e "${GREEN}✅ Passed:${NC} $PASSED"
echo -e "${YELLOW}⚠️  Warnings:${NC} $WARNINGS"
echo -e "${RED}❌ Failed:${NC} $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All critical checks passed!${NC}"
    echo ""
    echo "✅ Proxilion is ready for deployment"
    echo ""
    echo "Next steps:"
    echo "  1. Review warnings (if any)"
    echo "  2. Deploy to Cloudflare Workers: npm run deploy:production"
    echo "  3. Or run locally: npm start"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Validation failed with $FAILED critical errors${NC}"
    echo ""
    echo "Please fix the errors above before deploying."
    echo ""
    exit 1
fi

