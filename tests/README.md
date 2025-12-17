# Chaterm Testing Guide

This is a comprehensive testing documentation that explains how to run and extend various tests for the Chaterm project.

## 🎯 Test Architecture Overview

```
tests/
├── unit/                    # Unit tests
│   ├── components/AiTab/   # AI component tests
│   ├── api/                # API provider tests
│   └── utils/              # Utility function tests
├── integration/            # Integration tests
│   ├── ssh-database.test.ts    # SSH service and database integration
│   └── ai-message.test.ts      # AI service and message storage integration
├── e2e/                    # End-to-end tests
│   └── AI-functions.test.ts   # AI workflow tests
├── setup/                  # Test environment configuration
│   ├── unit.ts            # Unit test configuration
│   └── integration.ts     # Integration test configuration
├── helpers/                # Test helper utilities
│   └── electron-helper.ts # Electron test helper class
├── fixtures/               # Test data
│   └── test-connections.json  # Test connection configuration
├── mocks/                  # Mock data and services
└── screenshots/            # E2E test screenshots
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run All Tests

```bash
npm run test:all
```

### 3. Run Different Types of Tests Separately

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

## 📋 Available Test Commands

| Command                      | Description                            | Use Case                              |
| ---------------------------- | -------------------------------------- | ------------------------------------- |
| `npm test`                   | Run unit tests (watch mode)            | Development                           |
| `npm run test:unit`          | Run all unit tests                     | Quick code validation                 |
| `npm run test:integration`   | Run integration tests                  | Verify module interaction             |
| `npm run test:e2e`           | Run E2E tests                          | Verify complete user flow             |
| `npm run test:e2e:ui`        | Run E2E tests (UI mode)                | Visual E2E debugging                  |
| `npm run test:e2e:headed`    | Run E2E tests (headed mode)            | Observe test execution                |
| `npm run test:watch`         | Run tests in watch mode                | Continuous testing during development |
| `npm run test:coverage`      | Run tests and generate coverage report | Check test coverage                   |
| `npm run test:ai`            | Run AI-related tests                   | AI feature testing                    |
| `npm run test:all`           | Run all tests                          | CI/CD pipeline                        |
| `npm run test:build-and-e2e` | Run E2E tests after build              | Production validation                 |

## 🧪 Test Types Explained

### Unit Tests

**Purpose**: Test the functionality of individual functions, classes, or components
**Tools**: Vitest + Vue Test Utils
**Location**: `tests/unit/`

**Example**:

```typescript
test('should correctly create ChatMessage', () => {
  const message = createNewMessage('user', 'Hello AI')
  expect(message).toMatchObject({
    role: 'user',
    content: 'Hello AI',
    timestamp: expect.any(Number)
  })
})
```

**Coverage**:

- ✅ AI utility functions (`utils.test.ts`)
- ✅ Type validation (`types.test.ts`)
- ✅ Vue components (`index.test.ts`)
- ✅ API providers (`providers/`)

### Integration Tests

**Purpose**: Test interactions and data flow between different modules
**Tools**: Vitest + Better-sqlite3 + Mock services
**Location**: `tests/integration/`

**Example**:

```typescript
test('SSH service and database integration', async () => {
  const connection = await sshService.createConnection(config)
  await sshService.connect(connection.id)

  const result = await sshService.executeCommand(connection.id, 'ls -la')

  // Verify command execution and database storage
  expect(result.code).toBe(0)
  const history = sshService.getCommandHistory(connection.id)
  expect(history).toHaveLength(1)
})
```

**Coverage**:

- ✅ SSH service and database interaction (`ssh-database.test.ts`)
- ✅ AI service and message storage (`ai-message.test.ts`)

### End-to-End Tests (E2E Tests)

**Purpose**: Test complete application workflows from a user perspective
**Tools**: Playwright + Electron
**Location**: `tests/e2e/`

**Example**:

```typescript
test('Complete SSH connection → command execution → AI conversation flow', async () => {
  // 1. Launch application
  await electronHelper.launch()

  // 2. Create SSH connection
  await electronHelper.createSSHConnection(config)

  // 3. Execute command
  await electronHelper.executeCommand('ls -la')

  // 4. AI conversation
  await electronHelper.sendAIMessage('Explain the ls command output')
  const response = await electronHelper.waitForAIResponse()

  expect(response.length).toBeGreaterThan(0)
})
```

**Coverage**:

- ✅ Application startup and initialization (`app-startup.test.ts`)
- ✅ Keyboard shortcuts and interactions
- ✅ Error handling and recovery

## 📊 Test Coverage

Current coverage targets:

- **Branch Coverage**: 70%
- **Function Coverage**: 70%
- **Line Coverage**: 70%
- **Statement Coverage**: 70%

View detailed coverage report:

```bash
npm run test:coverage
open coverage/index.html  # Open HTML report
```

## 🛠️ Development Workflow

### 1. New Feature Development

```bash
# Start watch mode
npm run test:watch

# Write code and tests...
# Tests will automatically run and display results
```

### 2. Before Committing Code

```bash
# Run complete test suite
npm run test:all

# Check test coverage
npm run test:coverage
```

### 3. Debugging E2E Tests

```bash
# Run E2E tests with UI
npm run test:e2e:headed

# Use Playwright UI mode
npm run test:e2e:ui
```

### 4. When Fixing Bugs

```bash
# Write regression test first
# Then fix the code
# Ensure tests pass
npm run test:all
```

## 🔧 Extending Tests

### Adding New Unit Tests

1. Create test file under `tests/unit/`
2. Follow naming convention: `*.test.ts`
3. Use existing utility functions and mock data

```typescript
// tests/unit/new-feature.test.ts
import { describe, test, expect } from 'vitest'
import { newFeature } from '@/path/to/feature'

describe('New Feature Tests', () => {
  test('should correctly handle input', () => {
    const result = newFeature('input')
    expect(result).toBe('expected output')
  })
})
```

### Adding New Integration Tests

1. Create test file under `tests/integration/`
2. Use helper functions from `tests/setup/integration.ts`
3. Create real database and service interactions

```typescript
// tests/integration/new-integration.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '../setup/integration'

describe('New Service Integration Tests', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  test('should correctly integrate new service', async () => {
    // Test code
  })
})
```

### Adding New E2E Tests

1. Create test file under `tests/e2e/`
2. Use `ElectronHelper` class for application interaction
3. Write tests for critical user flows

```typescript
// tests/e2e/new-workflow.test.ts
import { test, expect } from '@playwright/test'
import { ElectronHelper } from '../helpers/electron-helper'

test.describe('New Workflow E2E Tests', () => {
  let electronHelper: ElectronHelper

  test.beforeEach(async () => {
    electronHelper = new ElectronHelper()
    await electronHelper.launch()
    await electronHelper.waitForAppReady()
  })

  test.afterEach(async () => {
    await electronHelper.close()
  })

  test('Complete new feature flow', async () => {
    // Test steps
  })
})
```

## 🐛 Troubleshooting

### Q: Unit tests fail to run

**Possible causes**:

- Incorrect dependency import paths
- Mock data configuration issues
- Component dependencies not handled correctly

**Solutions**:

```bash
# Check configuration
cat vitest.config.ts

# Verify path aliases
npm run typecheck
```

### Q: Integration test database errors

**Possible causes**:

- Test database path issues
- SQLite permission problems
- Concurrent access conflicts

**Solutions**:

```bash
# Clean test data
rm -rf tests/fixtures/test.db

# Run integration tests separately
npm run test:integration
```

### Q: E2E tests timeout or fail

**Possible causes**:

- Incomplete application build
- Electron startup timeout
- UI element selector changes

**Solutions**:

```bash
# Ensure application is built
npm run build

# Run in headed mode to see the issue
npm run test:e2e:headed

# Update screenshots
npm run test:e2e
```

### Q: Insufficient test coverage

**Solutions**:

```bash
# View detailed coverage report
npm run test:coverage
open coverage/index.html

# Identify uncovered code
# Write corresponding test cases
```

## 📈 Performance Testing

### Memory Usage Monitoring

```bash
# Run tests with memory monitoring
NODE_OPTIONS="--max-old-space-size=4096" npm run test:all
```

### Test Execution Time Analysis

```bash
# Generate test performance report
npm run test:coverage -- --reporter=verbose
```

## 🔄 Continuous Integration (CI/CD)

### GitHub Actions Configuration Example

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run build
      - run: npm run test:e2e
```

## 📝 Best Practices

### 1. Test Naming Conventions

- Descriptive test names
- Use "should..." format
- Clear English descriptions

### 2. Test Structure

```typescript
describe('Feature Module', () => {
  beforeEach(() => {
    // Setup before each test
  })

  test('should work under normal conditions', () => {
    // Arrange - Prepare data
    // Act - Execute operation
    // Assert - Verify result
  })

  test('should correctly handle error cases', () => {
    // Error case testing
  })
})
```

### 3. Mock Data Management

- Use `tests/fixtures/` to store test data
- Keep mock data realistic
- Regularly update test data

### 4. Test Isolation

- Each test runs independently
- Clean up test side effects
- Avoid interdependencies between tests

## 🎉 Summary

With this comprehensive testing solution, you can:

- ✅ **Quickly validate** code logic (Unit tests)
- ✅ **Ensure modules collaborate** correctly (Integration tests)
- ✅ **Verify user experience** is complete (E2E tests)
- ✅ **Continuously monitor** code quality (Coverage reports)
- ✅ **Automate** testing workflows (CI/CD integration)

Now you have a complete and reliable testing system that can greatly improve code quality and development efficiency! 🚀

---

**Need help?** Check the example code in specific test files, or refer to `TESTING_SETUP.md` for more detailed information.
