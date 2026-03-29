import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let originalFetch;
  let originalConsoleError;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    console.error = () => {}; // Silence logs
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should not leak botToken in errors', async () => {
    const service = new TelegramService({
      telegram: {
        botToken: 'SECRET_BOT_TOKEN_123',
        adminId: '123456789'
      }
    });

    let errorLogged = null;
    let errorLoggedStr = null;
    console.error = (msg, err) => {
      errorLoggedStr = msg;
      errorLogged = err;
    };

    global.fetch = async () => {
      throw new Error('fetch failed for url https://api.telegram.org/botSECRET_BOT_TOKEN_123/sendMessage');
    };

    await service.sendMessage('test message');

    assert.ok(errorLogged, 'Error should be logged');
    assert.ok(!errorLogged.message.includes('SECRET_BOT_TOKEN_123'), 'Error message should not contain bot token');
    assert.ok(errorLogged.message.includes('[HIDDEN_TOKEN]'), 'Error message should contain hidden token');
  });

  it('should not leak botToken in Telegram API Error logs', async () => {
    const service = new TelegramService({
      telegram: {
        botToken: 'SECRET_BOT_TOKEN_123',
        adminId: '123456789'
      }
    });

    let errorLogged = null;
    let errorLoggedStr = null;
    console.error = (msg, err) => {
      errorLoggedStr = msg;
      errorLogged = err;
    };

    global.fetch = async () => {
      return {
        ok: false,
        text: async () => 'Error with url https://api.telegram.org/botSECRET_BOT_TOKEN_123/sendMessage'
      };
    };

    await service.sendMessage('test message');

    assert.ok(errorLogged, 'Error should be logged');
    assert.ok(typeof errorLogged === 'string', 'Error text is a string');
    assert.ok(!errorLogged.includes('SECRET_BOT_TOKEN_123'), 'Error text should not contain bot token');
    assert.ok(errorLogged.includes('[HIDDEN_TOKEN]'), 'Error text should contain hidden token');
  });
});
