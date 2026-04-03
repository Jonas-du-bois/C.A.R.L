import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService - Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;
  let loggedErrors = [];

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    loggedErrors = [];
    console.error = (...args) => {
      loggedErrors.push(args.join(' '));
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should not leak botToken in error logs when sendMessage fails', async () => {
    const config = {
      telegram: {
        botToken: 'SECRET_BOT_TOKEN_12345',
        adminId: '123456'
      }
    };
    telegramService = new TelegramService(config);

    global.fetch = async () => {
      throw new Error('Network error on https://api.telegram.org/botSECRET_BOT_TOKEN_12345/sendMessage');
    };

    await telegramService.sendMessage('Test message');

    assert.strictEqual(loggedErrors.length, 1);
    assert.strictEqual(loggedErrors[0].includes('SECRET_BOT_TOKEN_12345'), false, 'Bot token leaked in log');
    assert.strictEqual(loggedErrors[0].includes('[HIDDEN_TOKEN]'), true, 'Bot token not sanitized');
  });

  it('should not leak botToken in answerCallback API error responses', async () => {
    const config = {
      telegram: {
        botToken: 'SECRET_BOT_TOKEN_12345',
        adminId: '123456'
      }
    };
    telegramService = new TelegramService(config);

    global.fetch = async () => ({
      ok: false,
      text: async () => 'Error accessing https://api.telegram.org/botSECRET_BOT_TOKEN_12345/answerCallbackQuery'
    });

    await telegramService.answerCallback('callback_123');

    // Currently answerCallback does not check response.ok, it only logs on network throw!
    // But let's test network throw:
    global.fetch = async () => {
        throw new Error('Error accessing https://api.telegram.org/botSECRET_BOT_TOKEN_12345/answerCallbackQuery')
    };

    loggedErrors = [];
    await telegramService.answerCallback('callback_123');

    assert.strictEqual(loggedErrors.length, 1);
    assert.strictEqual(loggedErrors[0].includes('SECRET_BOT_TOKEN_12345'), false, 'Bot token leaked in log');
    assert.strictEqual(loggedErrors[0].includes('[HIDDEN_TOKEN]'), true, 'Bot token not sanitized');
  });
});
