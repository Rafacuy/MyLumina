# Contributing to MyLumina

Thank you for your interest in contributing to MyLumina! This document provides guidelines and standards for maintaining code quality and consistency across the project.

## Table of Contents

- [Code Style Guidelines](#code-style-guidelines)
- [Documentation Standards](#documentation-standards)
- [File Organization](#file-organization)
- [Commit Message Convention](#commit-message-convention)
- [Development Workflow](#development-workflow)

## Code Style Guidelines

### Formatting

We use ESLint and Prettier to enforce consistent code formatting:

```bash
# Check for linting errors
npm run lint

# Fix auto-fixable linting errors
npm run lint:fix

# Format all files with Prettier
npm run format

# Check formatting without modifying files
npm run format:check
```

### Key Style Rules

- **Indentation**: 4 spaces (no tabs)
- **Quotes**: Single quotes for strings
- **Semicolons**: Required at the end of statements
- **Line length**: Maximum 120 characters
- **Trailing commas**: Required on multi-line objects/arrays
- **Variable declarations**: Use `const` by default, `let` when reassignment is needed (never `var`)

### Naming Conventions

- **Files**: Use camelCase for filenames (e.g., `commandHandlers.js`, `timeHelper.js`)
- **Functions**: Use camelCase (e.g., `getWeatherData`, `sendMessage`)
- **Constants**: Use UPPER_SNAKE_CASE for true constants (e.g., `MOOD_TIMEOUT_MS`, `SLEEP_START_HOUR`)
- **Classes**: Use PascalCase (e.g., `Mood`, `TelegramClient`)
- **Private functions**: Prefix with underscore (e.g., `_parseError`, `_botInstance`)

### Best Practices

1. **Always handle errors**: Use try-catch blocks for async operations
2. **Log appropriately**: Use the logger utility instead of console.log
3. **Avoid unused variables**: Remove or prefix with underscore if necessary
4. **Use strict equality**: Always use `===` and `!==` instead of `==` and `!=`
5. **Early returns**: Use early returns to reduce nesting

## Documentation Standards

### File Headers

Every file should begin with a clear, human-readable description:

```javascript
/**
 * [Filename] - [Brief description of what this file does]
 *
 * This module handles [specific functionality] and provides
 * [key features/capabilities]. It works by [brief explanation of
 * implementation approach].
 */
```

### Function Documentation

All functions must include JSDoc comments with:

```javascript
/**
 * [Brief description of what the function does in human-friendly language]
 *
 * This function takes [input] and transforms it into [output] by
 * [process explanation]. It handles [edge cases/special scenarios]
 * and returns [expected result].
 *
 * @param {string} paramName - Human-readable description of the parameter
 * @param {number} [optionalParam] - Optional parameters marked with brackets
 * @returns {Promise<Object>} Description of return value and its structure
 * @throws {Error} When [specific error condition occurs]
 * @example
 * // Show a real-world usage example
 * const result = await functionName('input', 42);
 * console.log(result.property); // 'expected output'
 */
```

### Inline Comments

Use inline comments to explain **why**, not **what**:

```javascript
// Good: Explains the reasoning
// Only check cache if user preferences allow caching
if (globalState.isCacheEnabled && cache.has(key)) {
    return cache.get(key);
}

// Bad: Just describes the code
// Check if cache has the key
if (cache.has(key)) {
    return cache.get(key);
}
```

### JSDoc Style Guide

#### File-Level Documentation

Every module/file should have a comprehensive header explaining its purpose:

```javascript
/**
 * filename.js - Brief description of the module's purpose
 *
 * This module provides [specific functionality] for the MyLumina bot.
 * It handles [key responsibilities] and integrates with [related modules]
 * to provide [main feature/benefit].
 *
 * Key Features:
 * - Feature 1: Brief explanation
 * - Feature 2: Brief explanation
 * - Feature 3: Brief explanation
 *
 * Architecture:
 * Explain the high-level design, data flow, or architectural patterns used.
 *
 * Dependencies:
 * List any special requirements, external APIs, or configuration needed.
 *
 * @module path/to/module
 * @requires dependency1
 * @requires dependency2
 * @author Author Name
 */
```

#### Function Documentation

Functions should be documented with comprehensive JSDoc:

```javascript
/**
 * Brief, human-readable description of what the function does.
 *
 * Provide additional context about the implementation, why certain
 * approaches were chosen, and any important considerations for
 * developers using this function.
 *
 * Key behaviors:
 * - Behavior 1: Explanation
 * - Behavior 2: Explanation
 *
 * Edge cases:
 * - Edge case 1: How it's handled
 * - Edge case 2: How it's handled
 *
 * @param {string} paramName - Description including valid values, defaults
 * @param {number} [optionalParam=10] - Optional params with defaults marked
 * @param {Object} options - Configuration object
 * @param {boolean} options.enabled - Whether feature is enabled
 * @returns {Promise<Object>} Description of return structure
 * @returns {null} When condition X is not met
 * @throws {ValidationError} When input fails validation
 * @throws {NetworkError} When API call fails
 * @async
 * @example
 * // Basic usage
 * const result = await myFunction('input', { enabled: true });
 *
 * @example
 * // With error handling
 * try {
 *   const result = await myFunction('input');
 * } catch (error) {
 *   console.error('Failed:', error.message);
 * }
 */
```

#### Class Documentation

Classes should document their purpose, responsibilities, and usage:

```javascript
/**
 * ClassName - Brief description of the class.
 *
 * This class provides [functionality] by [approach]. It maintains
 * [state] and exposes methods for [operations].
 *
 * Responsibilities:
 * - Responsibility 1
 * - Responsibility 2
 * - Responsibility 3
 *
 * Lifecycle:
 * 1. Construction: Explain initialization
 * 2. Configuration: Explain setup methods
 * 3. Usage: Explain main operations
 * 4. Cleanup: Explain disposal if applicable
 *
 * @class ClassName
 * @extends ParentClass (if applicable)
 * @implements Interface (if applicable)
 * @example
 * const instance = new ClassName(config);
 * await instance.initialize();
 * const result = await instance.process(data);
 */
```

#### Constant and Variable Documentation

Important constants should be documented:

```javascript
/**
 * Description of what this constant represents and why it has this value.
 *
 * This timeout was chosen because [reasoning]. It balances [factor A]
 * against [factor B] to achieve [goal].
 *
 * @constant {number}
 * @default 30000
 */
const API_TIMEOUT_MS = 30000;

/**
 * Current state of the application component.
 *
 * This object tracks [what it tracks] and is used by [which functions]
 * to make decisions about [what decisions].
 *
 * @type {Object}
 * @property {string} status - Current status ('idle', 'processing', 'error')
 * @property {number} count - Number of processed items
 * @property {Date} lastUpdated - Timestamp of last update
 */
let applicationState = {
    status: 'idle',
    count: 0,
    lastUpdated: null,
};
```

#### Type Definitions

Use `@typedef` for complex object structures:

```javascript
/**
 * User preference object structure.
 *
 * @typedef {Object} UserPreference
 * @property {string} key - Preference identifier
 * @property {string|number|boolean} value - Preference value
 * @property {number} priority - Priority level (0-100)
 * @property {Date} createdAt - When preference was first recorded
 * @property {Date} [updatedAt] - When preference was last modified
 */

/**
 * Processes user preferences.
 * @param {UserPreference} preference - Preference to process
 * @returns {Promise<boolean>} Success status
 */
async function processPreference(preference) {
    // Implementation
}
```

#### Event Documentation

Document events and callbacks:

```javascript
/**
 * Event fired when a message is received.
 *
 * @event module:bot#message
 * @type {Object}
 * @property {number} chatId - Chat identifier
 * @property {string} text - Message content
 * @property {Date} timestamp - When message was received
 * @property {User} from - Sender information
 */

/**
 * Handles incoming messages.
 *
 * @param {Object} ctx - Telegram context object
 * @param {Object} ctx.message - Message object
 * @param {number} ctx.message.chatId - Chat identifier
 * @param {string} ctx.message.text - Message text
 * @listens module:bot#message
 */
function handleMessage(ctx) {
    // Implementation
}
```

### Documentation Principles

1. **Be human-first**: Write documentation that helps developers understand, not just machines
2. **Explain context**: Why does this exist? What problem does it solve?
3. **Provide examples**: Show real usage scenarios
4. **Document gotchas**: Call out edge cases, limitations, or special behaviors
5. **Keep it current**: Update docs when code changes
6. **Use consistent style**: Follow the patterns established in existing code
7. **Be specific**: Avoid vague terms like "handles stuff" - be precise about what it does
8. **Document assumptions**: State any assumptions the code makes about inputs or environment
9. **Link related code**: Reference related functions, modules, or external resources
10. **Include units**: Always specify units for time, size, or other measurements (ms, MB, etc.)

## File Organization

### Directory Structure

```
core/           # Core bot logic and AI response handling
├── core.js     # Main bot initialization and message processing
└── ai-response.js  # AI response generation and prompt management

handler/        # Command and event handlers
├── commandHandlers.js    # Command routing and responses
├── contextHandler.js     # Conversation context detection
├── docHandler.js         # Document processing
├── holidayHandlers.js    # Holiday API integration
├── relationHandler.js    # Relationship state management
└── visionHandler.js      # Image/Vision processing

modules/        # Feature modules
├── chatSummarizer.js     # Chat history summarization
├── commandLists.js       # Command definitions and reminders
├── documentReader.js     # Document parsing
├── loveStateManager.js   # Relationship tracking
├── ltmProcessor.js       # Long-term memory processing
├── mood.js               # Mood state management
├── newsManager.js        # News fetching and summarization
├── selfieManager.js      # Selfie response handling
├── ttsManager.js         # Text-to-speech scheduling
└── weather.js            # Weather API integration

scheduler/      # Scheduled tasks
├── cronSetup.js          # Cron job configuration
└── updateTimeModes.js    # Time-based mode updates

state/          # State management
└── globalState.js        # Global application state

utils/          # Utility functions
├── cacheHelper.js        # Cache management utilities
├── chatFormatter.js      # Message formatting
├── logger.js             # Logging utilities
├── pollingErrorHandler.js # Error handling for polling
├── sendMessage.js        # Message sending utilities
├── songNotifier.js       # Song notification scheduling
├── telegramClient.js     # Telegram client initialization
├── telegramHelper.js     # Telegram helper functions
└── timeHelper.js         # Time/date utilities
```

### Import Order

Organize imports in this order:

1. **Built-in modules** (e.g., `path`, `fs`)
2. **Third-party dependencies** (e.g., `axios`, `express`)
3. **Internal modules** - Group by directory:
    - Config files first
    - Core modules
    - Handlers
    - Modules
    - Utils
    - Data/State

Example:

```javascript
// 1. Built-in
const path = require('path');
const fs = require('fs');

// 2. Third-party
const axios = require('axios');
const { Mutex } = require('async-mutex');

// 3. Internal - Config
const config = require('../config/config');
const { isFeatureEnabled } = require('../config/featureConfig');

// 4. Internal - Core
const { generateAIResponse } = require('./ai-response');

// 5. Internal - Handlers
const commandHandlers = require('../handler/commandHandlers');

// 6. Internal - Modules
const weather = require('../modules/weather');

// 7. Internal - Utils
const logger = require('../utils/logger');

// 8. Internal - Data/State
const memory = require('../data/memory');
const globalState = require('../state/globalState');
```

## Commit Message Convention

Use clear, descriptive commit messages:

```
[type]: [short description]

[optional longer description explaining why and what]
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:

```
feat: add weather reminder scheduling

Implements automatic weather updates every morning at 7 AM.
Uses node-schedule for cron-like scheduling.

fix: resolve memory leak in LTM processor

The cache was growing unbounded. Added MAX_LTM_CACHE_SIZE
constant and automatic eviction of oldest entries.

docs: improve JSDoc for command handlers

Added comprehensive documentation explaining the command
routing system and provided usage examples.
```

## Development Workflow

### Before Submitting Changes

1. **Run linting**:

    ```bash
    npm run lint
    ```

2. **Format code**:

    ```bash
    npm run format
    ```

3. **Test your changes**: Ensure the bot starts and basic functionality works

4. **Update documentation**: If you changed behavior, update relevant docs

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Functions are properly documented
- [ ] No console.log statements (use logger instead)
- [ ] Error handling is in place
- [ ] No unused variables or imports
- [ ] Complex logic is explained with comments

## Questions?

If you have questions about contributing, feel free to reach out through:

- GitHub Issues
- TikTok: [@rafardhancuy](https://tiktok.com/@rafardhancuy)

Thank you for helping make MyLumina better!
