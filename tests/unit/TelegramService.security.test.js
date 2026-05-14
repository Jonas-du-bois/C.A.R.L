import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security Tests', () => {
  let originalFetch;
  let originalConsoleError;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  test('should not leak API token in error logs when fetch fails', async () => {
    const secretToken = 'SECRET_TELEGRAM_TOKEN_123';
    let loggedError = null;

    global.fetch = async () => {
      const rootError = new Error(`Connection failed to https://api.telegram.org/bot${secretToken}/sendMessage`);
      throw new TypeError('fetch failed', { cause: rootError });
    };

    console.error = (msg, err) => {
      loggedError = err;
    };

    const config = {
      telegram: {
        botToken: secretToken,
        adminId: '12345',
        allowedUserId: '12345'
      }
    };
    const service = new TelegramService(config);
    await service.sendMessage('test message');

    assert.ok(loggedError, 'An error should have been logged');

    // The secret should be completely scrubbed
    assert.strictEqual(loggedError.message.includes(secretToken), false, 'Token leaked in error message');
    assert.strictEqual(loggedError.stack.includes(secretToken), false, 'Token leaked in stack trace');

    // The underlying cause must also be scrubbed
    assert.ok(loggedError.cause, 'Error should retain a cause');
    assert.strictEqual(loggedError.cause.message.includes(secretToken), false, 'Token leaked in nested cause message');
  });
});
