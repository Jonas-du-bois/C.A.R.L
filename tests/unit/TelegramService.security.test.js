import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should not leak botToken when fetch fails in sendMessage', async () => {
    const config = {
      telegram: {
        botToken: 'SECRET_BOT_TOKEN_12345',
        adminId: '123456'
      }
    };

    telegramService = new TelegramService(config);

    let loggedError = null;
    const originalConsoleError = console.error;
    console.error = (msg, err) => {
      loggedError = typeof err === 'string' ? err : (err && err.message) ? err.message : String(err);
      if (err && err.cause) {
        loggedError += ' ' + String(err.cause);
      }
    };

    global.fetch = async () => {
      const rootError = new Error('getaddrinfo ENOTFOUND api.telegram.org');
      const fetchError = new TypeError('fetch failed', { cause: rootError });
      fetchError.message = `fetch failed: https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
      fetchError.cause.message = `getaddrinfo ENOTFOUND https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
      throw fetchError;
    };

    try {
      await telegramService.sendMessage('Test message');
    } finally {
      console.error = originalConsoleError;
    }

    assert.ok(loggedError !== null, 'An error should have been logged');
    assert.strictEqual(loggedError.includes('SECRET_BOT_TOKEN_12345'), false, 'Bot token leaked in error log!');
    assert.ok(loggedError.includes('[HIDDEN_TOKEN]'), 'Bot token should be replaced by placeholder');
  });
});
