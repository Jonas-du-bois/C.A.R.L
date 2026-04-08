import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;
  let loggedErrors;

  const config = {
    telegram: {
      botToken: '12345:ABC-DEF_token_secret',
      adminId: '123456'
    }
  };

  beforeEach(() => {
    telegramService = new TelegramService(config);
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    loggedErrors = [];
    console.error = (...args) => loggedErrors.push(args);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  describe('Error Sanitization', () => {
    it('should sanitize the bot token in string errors', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          text: async () => 'Unauthorized access to https://api.telegram.org/bot12345:ABC-DEF_token_secret/getUpdates'
        };
      };

      await telegramService.sendMessage('test');

      assert.strictEqual(loggedErrors.length, 1);
      const errorMessage = loggedErrors[0][1];
      assert.strictEqual(typeof errorMessage, 'string');
      assert.strictEqual(errorMessage.includes('12345:ABC-DEF_token_secret'), false, 'Token should be sanitized');
      assert.strictEqual(errorMessage.includes('[HIDDEN_TOKEN]'), true, 'Token should be replaced with [HIDDEN_TOKEN]');
    });

    it('should sanitize the bot token in Error objects', async () => {
      global.fetch = async () => {
        throw new Error('Network fetch failed for https://api.telegram.org/bot12345:ABC-DEF_token_secret/getUpdates');
      };

      await telegramService.sendMessage('test');

      assert.strictEqual(loggedErrors.length, 1);
      const errorObj = loggedErrors[0][1];
      assert.ok(errorObj instanceof Error);
      assert.strictEqual(errorObj.message.includes('12345:ABC-DEF_token_secret'), false, 'Token in message should be sanitized');
      assert.strictEqual(errorObj.message.includes('[HIDDEN_TOKEN]'), true, 'Token should be replaced with [HIDDEN_TOKEN]');
      assert.strictEqual(errorObj.stack.includes('12345:ABC-DEF_token_secret'), false, 'Token in stack should be sanitized');
    });

    it('should recursively sanitize nested Error causes and custom properties', async () => {
      global.fetch = async () => {
        const rootError = new Error('Root error: 12345:ABC-DEF_token_secret');
        rootError.cause = new Error('Nested cause: 12345:ABC-DEF_token_secret');
        rootError.customUrl = 'http://api.telegram.org/bot12345:ABC-DEF_token_secret/';
        throw rootError;
      };

      await telegramService.sendMessage('test');

      assert.strictEqual(loggedErrors.length, 1);
      const errorObj = loggedErrors[0][1];

      assert.ok(errorObj instanceof Error);
      assert.strictEqual(errorObj.message.includes('12345:ABC-DEF_token_secret'), false, 'Token in message should be sanitized');
      assert.strictEqual(errorObj.customUrl.includes('12345:ABC-DEF_token_secret'), false, 'Token in custom property should be sanitized');
      assert.strictEqual(errorObj.customUrl.includes('[HIDDEN_TOKEN]'), true);

      assert.ok(errorObj.cause instanceof Error);
      assert.strictEqual(errorObj.cause.message.includes('12345:ABC-DEF_token_secret'), false, 'Token in nested cause should be sanitized');
      assert.strictEqual(errorObj.cause.message.includes('[HIDDEN_TOKEN]'), true);
    });
  });
});