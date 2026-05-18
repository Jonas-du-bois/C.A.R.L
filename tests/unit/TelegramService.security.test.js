import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('should sanitize token from fetch network errors', async () => {
    const token = '12345:ABCDEF';
    const service = new TelegramService({
      telegram: {
        botToken: token,
        adminId: '123'
      }
    });

    const rootError = new Error(`Failed to fetch https://api.telegram.org/bot${token}/sendMessage`);
    const fetchError = new TypeError('fetch failed', { cause: rootError });

    global.fetch = async () => { throw fetchError; };

    // Intercept console.error to check what gets logged
    const originalConsoleError = console.error;
    let loggedError = null;
    console.error = (msg, err) => { loggedError = err; };

    try {
      await service.sendMessage('test');
    } finally {
      console.error = originalConsoleError;
    }

    assert.ok(loggedError, 'An error should have been logged');
    assert.ok(!loggedError.message.includes(token), 'Token should be sanitized from message');
    assert.ok(!loggedError.stack.includes(token), 'Token should be sanitized from stack');
    assert.ok(loggedError.cause, 'Cause should be preserved');
    assert.ok(!loggedError.cause.message.includes(token), 'Token should be sanitized from nested cause');
    assert.ok(loggedError.cause.message.includes('[HIDDEN_TOKEN]'), 'Token should be replaced with placeholder');
  });
});
