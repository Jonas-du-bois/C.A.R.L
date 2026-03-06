import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
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

  it('should not leak bot token in error logs when fetch throws an error', async () => {
    const config = {
      telegram: {
        botToken: 'SECRET_BOT_TOKEN_123',
        adminId: '123456'
      }
    };

    const telegramService = new TelegramService(config);

    global.fetch = async (url) => {
      throw new Error(`Failed to fetch from ${url}`);
    };

    let loggedError = '';
    console.error = (...args) => {
      loggedError = args.join(' ');
    };

    await telegramService.sendMessage('Test message');

    assert.strictEqual(loggedError.includes('SECRET_BOT_TOKEN_123'), false, 'Bot token was leaked in console.error');
    assert.strictEqual(loggedError.includes('[REDACTED]'), true, 'Bot token was not redacted in console.error');
  });

  it('should not leak bot token in error logs when fetch returns non-ok response with token in body', async () => {
    const config = {
      telegram: {
        botToken: 'SECRET_BOT_TOKEN_123',
        adminId: '123456'
      }
    };

    const telegramService = new TelegramService(config);

    global.fetch = async () => ({
      ok: false,
      text: async () => 'Error accessing https://api.telegram.org/botSECRET_BOT_TOKEN_123/sendMessage'
    });

    let loggedError = '';
    console.error = (...args) => {
      loggedError = args.join(' ');
    };

    await telegramService.sendMessage('Test message');

    assert.strictEqual(loggedError.includes('SECRET_BOT_TOKEN_123'), false, 'Bot token was leaked in console.error');
    assert.strictEqual(loggedError.includes('[REDACTED]'), true, 'Bot token was not redacted in console.error');
  });
});
