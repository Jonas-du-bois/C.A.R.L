import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService - Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;
  let consoleErrorOutput;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    consoleErrorOutput = [];

    console.error = (...args) => {
      consoleErrorOutput.push(args);
    };

    const config = {
      telegram: {
        botToken: 'secret-bot-token-12345',
        adminId: '123456'
      }
    };
    telegramService = new TelegramService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  describe('Error Sanitization', () => {
    it('should sanitize bot token from string error messages when fetch fails', async () => {
      global.fetch = async () => ({
        ok: false,
        text: async () => 'Unauthorized access for bot secret-bot-token-12345 in API'
      });

      await telegramService.sendMessage('Test message');

      const loggedError = consoleErrorOutput.find(args => args[0] === 'Telegram API Error:')[1];
      assert.strictEqual(typeof loggedError, 'string');
      assert.ok(!loggedError.includes('secret-bot-token-12345'), 'Bot token should not be logged');
      assert.ok(loggedError.includes('[HIDDEN_TOKEN]'), 'Bot token should be replaced');
      assert.strictEqual(loggedError, 'Unauthorized access for bot [HIDDEN_TOKEN] in API');
    });

    it('should sanitize bot token from Error objects thrown by fetch', async () => {
      global.fetch = async () => {
        throw new Error('Network error connecting to https://api.telegram.org/botsecret-bot-token-12345/sendMessage');
      };

      await telegramService.sendMessage('Test message');

      const loggedError = consoleErrorOutput.find(args => args[0] === 'Failed to send Telegram message:')[1];
      assert.ok(loggedError instanceof Error);
      assert.ok(!loggedError.message.includes('secret-bot-token-12345'), 'Bot token should not be in message');
      assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'), 'Bot token should be replaced in message');
      if (loggedError.stack) {
         assert.ok(!loggedError.stack.includes('secret-bot-token-12345'), 'Bot token should not be in stack');
         assert.ok(loggedError.stack.includes('[HIDDEN_TOKEN]'), 'Bot token should be replaced in stack');
      }
    });

    it('should sanitize nested error causes recursively', async () => {
      global.fetch = async () => {
        const rootError = new Error('Top level error for secret-bot-token-12345');
        rootError.cause = new Error('Inner cause for secret-bot-token-12345');
        throw rootError;
      };

      await telegramService.sendMessage('Test message');

      const loggedError = consoleErrorOutput.find(args => args[0] === 'Failed to send Telegram message:')[1];
      assert.ok(!loggedError.message.includes('secret-bot-token-12345'));
      assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'));

      assert.ok(loggedError.cause instanceof Error);
      assert.ok(!loggedError.cause.message.includes('secret-bot-token-12345'));
      assert.ok(loggedError.cause.message.includes('[HIDDEN_TOKEN]'));
    });
  });
});
