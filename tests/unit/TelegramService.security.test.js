import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;
  const botToken = 'SECRET_BOT_TOKEN_123';

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should not leak botToken in logged error from fetch failure', async () => {
    const config = {
      telegram: {
        botToken: botToken,
        adminId: '123456'
      }
    };

    telegramService = new TelegramService(config);

    // Create an error that contains the secret in its message, stack, and cause
    const causeError = new Error(`Nested fetch failed at https://api.telegram.org/bot${botToken}/sendMessage`);
    const networkError = new Error(`Network error at https://api.telegram.org/bot${botToken}/sendMessage`);
    networkError.cause = causeError;
    networkError.stack = `Error: Network error at https://api.telegram.org/bot${botToken}/sendMessage\n  at Object.<anonymous> (/app/test.js:1:1)`;

    global.fetch = async () => {
      throw networkError;
    };

    let loggedArgs = null;
    console.error = (...args) => {
      loggedArgs = args;
    };

    await telegramService.sendMessage('Test message');

    assert.ok(loggedArgs, 'console.error should have been called');

    // Find the error object in loggedArgs
    const loggedError = loggedArgs.find(arg => arg instanceof Error);

    assert.ok(loggedError, 'An Error object should be passed to console.error');

    // Assert original structure is maintained
    assert.strictEqual(loggedError.name, networkError.name);

    // Assert no leaks in message
    assert.ok(!loggedError.message.includes(botToken), 'botToken leaked in error message');
    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'), 'botToken not replaced in message');

    // Assert no leaks in stack
    assert.ok(!loggedError.stack.includes(botToken), 'botToken leaked in error stack');
    assert.ok(loggedError.stack.includes('[HIDDEN_TOKEN]'), 'botToken not replaced in stack');

    // Assert no leaks in cause
    assert.ok(loggedError.cause, 'Error cause should be preserved');
    assert.ok(!loggedError.cause.message.includes(botToken), 'botToken leaked in cause message');
    assert.ok(loggedError.cause.message.includes('[HIDDEN_TOKEN]'), 'botToken not replaced in cause message');

    // Assert other logged strings do not contain token
    for (const arg of loggedArgs) {
      if (typeof arg === 'string') {
        assert.ok(!arg.includes(botToken), 'botToken leaked in string argument');
      }
    }
  });
});
