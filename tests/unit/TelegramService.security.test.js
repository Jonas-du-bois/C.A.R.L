import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let originalConsoleError;
  let originalFetch;

  beforeEach(() => {
    originalConsoleError = console.error;
    originalFetch = global.fetch;
  });

  afterEach(() => {
    console.error = originalConsoleError;
    global.fetch = originalFetch;
  });

  it('should sanitize botToken in error messages', async () => {
    const config = {
      telegram: {
        botToken: 'secret-token-12345',
        adminId: '123456'
      }
    };

    const telegramService = new TelegramService(config);

    global.fetch = async () => {
      throw new Error('Network error on https://api.telegram.org/botsecret-token-12345/sendMessage');
    };

    let loggedError = null;
    console.error = (msg, err) => {
      loggedError = err;
    };

    await telegramService.sendMessage('Test message');

    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'));
    assert.ok(!loggedError.message.includes('secret-token-12345'));
  });
});
