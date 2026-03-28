import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let consoleErrorMock;

  beforeEach(() => {
    originalFetch = global.fetch;
    consoleErrorMock = mock.method(console, 'error', () => {});

    const config = {
      telegram: {
        botToken: 'secret-token-12345',
        adminId: '123456'
      }
    };
    telegramService = new TelegramService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleErrorMock.mock.restore();
  });

  describe('Secret Leakage Prevention', () => {
    it('should not leak botToken in network error logs for sendMessage', async () => {
      global.fetch = async () => {
        throw new Error('fetch failed: https://api.telegram.org/botsecret-token-12345/sendMessage');
      };

      await telegramService.sendMessage('Test');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 1);
      const errorMessage = consoleErrorMock.mock.calls[0].arguments[1].message;

      assert.strictEqual(errorMessage.includes('secret-token-12345'), false, 'Bot token should not be in error message');
      assert.strictEqual(errorMessage.includes('[HIDDEN_TOKEN]'), true, 'Bot token should be replaced with [HIDDEN_TOKEN]');
    });

    it('should not leak botToken in API error logs for sendMessage', async () => {
      global.fetch = async () => ({
        ok: false,
        text: async () => 'API Error at /botsecret-token-12345/sendMessage'
      });

      await telegramService.sendMessage('Test');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 1);
      const errorMessage = consoleErrorMock.mock.calls[0].arguments[1];

      assert.strictEqual(errorMessage.includes('secret-token-12345'), false, 'Bot token should not be in error message');
      assert.strictEqual(errorMessage.includes('[HIDDEN_TOKEN]'), true, 'Bot token should be replaced with [HIDDEN_TOKEN]');
    });

    it('should not leak botToken in network error logs for answerCallback', async () => {
      global.fetch = async () => {
        throw new Error('fetch failed: https://api.telegram.org/botsecret-token-12345/answerCallbackQuery');
      };

      await telegramService.answerCallback('callback_123', 'Test');

      assert.strictEqual(consoleErrorMock.mock.calls.length, 1);
      const errorMessage = consoleErrorMock.mock.calls[0].arguments[1].message;

      assert.strictEqual(errorMessage.includes('secret-token-12345'), false, 'Bot token should not be in error message');
      assert.strictEqual(errorMessage.includes('[HIDDEN_TOKEN]'), true, 'Bot token should be replaced with [HIDDEN_TOKEN]');
    });
  });
});
