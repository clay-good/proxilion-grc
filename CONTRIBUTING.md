# Contributing to Proxilion

Thank you for your interest in contributing to Proxilion! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and constructive in all interactions.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Node version, etc.)
- **Logs or error messages** if applicable
- **Screenshots** if relevant

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear title and description**
- **Use case** - why is this enhancement needed?
- **Proposed solution** - how should it work?
- **Alternatives considered**
- **Additional context** - mockups, examples, etc.

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following our coding standards
3. **Add tests** for any new functionality
4. **Update documentation** as needed
5. **Ensure tests pass** (`pnpm test`)
6. **Lint your code** (`pnpm lint`)
7. **Commit with clear messages** following our commit conventions
8. **Submit a pull request**

## Development Setup

### Prerequisites

- Node.js 18+ or Bun
- pnpm (recommended) or npm
- Git

### Setup Steps

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/proxilion.git
cd proxilion

# Add upstream remote
git remote add upstream https://github.com/proxilion/proxilion.git

# Install dependencies
pnpm install

# Run in development mode
pnpm dev
```

### Development Workflow

```bash
# Create a feature branch
git checkout -b feature/my-feature

# Make changes and test
pnpm test

# Lint and format
pnpm lint
pnpm format

# Commit changes
git commit -m "feat: add amazing feature"

# Push to your fork
git push origin feature/my-feature
```

## Coding Standards

### TypeScript

- Use TypeScript for all code
- Enable strict mode
- Provide type annotations for public APIs
- Avoid `any` types when possible

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check linting
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

### Naming Conventions

- **Files**: kebab-case (e.g., `pii-scanner.ts`)
- **Classes**: PascalCase (e.g., `PIIScanner`)
- **Functions/Variables**: camelCase (e.g., `scanRequest`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Interfaces/Types**: PascalCase (e.g., `ScanResult`)

### Code Organization

```typescript
// 1. Imports (external first, then internal)
import { Hono } from 'hono';
import { logger } from './utils/logger.js';

// 2. Type definitions
interface MyInterface {
  // ...
}

// 3. Constants
const MAX_RETRIES = 3;

// 4. Main code
export class MyClass {
  // ...
}

// 5. Helper functions
function helperFunction() {
  // ...
}
```

### Documentation

- Add JSDoc comments for public APIs
- Include examples in documentation
- Update README.md for user-facing changes
- Add inline comments for complex logic

```typescript
/**
 * Scans a request for security threats
 * 
 * @param request - The unified AI request to scan
 * @returns Promise resolving to scan results
 * @throws {ProxilionError} If scanning fails
 * 
 * @example
 * ```typescript
 * const result = await scanner.scan(request);
 * if (!result.passed) {
 *   console.log('Threats detected:', result.findings);
 * }
 * ```
 */
async scan(request: UnifiedAIRequest): Promise<ScanResult> {
  // Implementation
}
```

## Testing

### Writing Tests

- Write tests for all new features
- Maintain or improve code coverage
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

```typescript
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('should do something specific', async () => {
    // Arrange
    const input = createTestInput();
    
    // Act
    const result = await myFeature(input);
    
    // Assert
    expect(result).toBe(expectedValue);
  });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test pii-scanner.test.ts
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(scanner): add credit card detection to PII scanner

Add support for detecting credit card numbers using Luhn algorithm
validation to reduce false positives.

Closes #123

---

fix(proxy): handle connection timeout correctly

Previously, connection timeouts would cause unhandled promise rejections.
Now they are properly caught and logged.

---

docs(readme): update installation instructions

Add instructions for Bun runtime and update Node.js version requirement.
```

## Project Structure

Understanding the project structure helps you navigate the codebase:

```
proxilion/
├── src/
│   ├── index.ts              # Main entry point
│   ├── types/                # TypeScript types
│   ├── proxy/                # Network layer
│   ├── parsers/              # Protocol parsers
│   ├── scanners/             # Security scanners
│   ├── policy/               # Policy engine
│   └── utils/                # Utilities
├── tests/                    # Test files
├── examples/                 # Usage examples
├── docs/                     # Documentation
└── scripts/                  # Build/deploy scripts
```

## Adding New Features

### Adding a New Scanner

1. Create a new file in `src/scanners/`
2. Extend `BaseScanner` class
3. Implement the `scan()` method
4. Register in `ScannerOrchestrator`
5. Add tests in `tests/`
6. Update documentation

Example:

```typescript
// src/scanners/my-scanner.ts
import { BaseScanner } from './base-scanner.js';
import { UnifiedAIRequest, ScanResult, ThreatLevel } from '../types/index.js';

export class MyScanner extends BaseScanner {
  id = 'my-scanner';
  name = 'My Custom Scanner';

  async scan(request: UnifiedAIRequest): Promise<ScanResult> {
    const startTime = Date.now();
    const findings = [];

    // Your scanning logic here

    return this.createResult(
      findings.length === 0,
      ThreatLevel.NONE,
      0,
      findings,
      Date.now() - startTime
    );
  }
}
```

### Adding a New Parser

1. Create a new file in `src/parsers/`
2. Extend `BaseParser` class
3. Implement `canParse()` and `parse()` methods
4. Register in `ParserRegistry`
5. Add tests
6. Update documentation

### Adding a New Policy

Policies can be added programmatically or through configuration:

```typescript
import { PolicyEngine } from './policy/policy-engine.js';

const policy = {
  id: 'my-policy',
  name: 'My Custom Policy',
  description: 'Description of what this policy does',
  enabled: true,
  priority: 100,
  conditions: [
    // Your conditions
  ],
  actions: [
    // Your actions
  ],
};

policyEngine.addPolicy(policy);
```

## Release Process

Releases are managed by maintainers:

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create a git tag
4. Push to GitHub
5. GitHub Actions will build and publish

## Getting Help

- 💬 [Discord Community](https://discord.gg/proxilion)
- 📧 Email: dev@proxilion.dev
- 🐛 [GitHub Issues](https://github.com/proxilion/proxilion/issues)

## Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Project website

Thank you for contributing to Proxilion! 🎉

