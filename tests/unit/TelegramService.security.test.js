import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security Tests', () => {
  let telegramService;
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

  describe('Secret Leakage Prevention', () => {
    it('should sanitize bot token in fetch errors', async () => {
      const botToken = 'SECRET_BOT_TOKEN_12345';
      const config = {
        telegram: {
          botToken: botToken,
          adminId: '123456'
        }
      };

      telegramService = new TelegramService(config);

      // Mock fetch to throw an error containing the bot token
      global.fetch = async () => {
        const err = new Error(`Failed to fetch https://api.telegram.org/bot${botToken}/sendMessage`);
        err.cause = new Error(`Connection reset while fetching https://api.telegram.org/bot${botToken}/sendMessage`);
        err.customProp = `Error details with token: ${botToken}`;
        throw err;
      };

      // Mock console.error to capture logged messages
      let capturedError = null;
      let capturedMessage = null;
      console.error = (msg, err) => {
        capturedMessage = msg;
        capturedError = err;
      };

      await telegramService.sendMessage('Test message');

      assert.strictEqual(capturedMessage, 'Failed to send Telegram message:');
      assert.ok(capturedError instanceof Error, 'Captured error is not an Error instance');

      // Verify the token is not present in the error message, stack, cause, or custom properties
      assert.ok(!capturedError.message.includes(botToken), 'Bot token leaked in error message');
      assert.ok(capturedError.message.includes('[HIDDEN_TOKEN]'), 'Bot token was not replaced with placeholder');

      assert.ok(!capturedError.stack.includes(botToken), 'Bot token leaked in error stack');
      assert.ok(capturedError.stack.includes('[HIDDEN_TOKEN]'), 'Bot token in stack was not replaced with placeholder');

      assert.ok(!capturedError.cause.message.includes(botToken), 'Bot token leaked in nested error cause');
      assert.ok(capturedError.cause.message.includes('[HIDDEN_TOKEN]'), 'Bot token in nested error cause was not replaced');

      assert.ok(!capturedError.customProp.includes(botToken), 'Bot token leaked in custom error property');
      assert.ok(capturedError.customProp.includes('[HIDDEN_TOKEN]'), 'Bot token in custom property was not replaced');
    });

    it('should sanitize bot token in API text responses', async () => {
      const botToken = 'SECRET_BOT_TOKEN_12345';
      const config = {
        telegram: {
          botToken: botToken,
          adminId: '123456'
        }
      };

      telegramService = new TelegramService(config);

      // Mock fetch to return an API error containing the bot token
      global.fetch = async () => ({
        ok: false,
        text: async () => `API Error: Invalid token ${botToken}`
      });

      // Mock console.error to capture logged messages
      let capturedError = null;
      let capturedMessage = null;
      console.error = (msg, err) => {
        capturedMessage = msg;
        capturedError = err;
      };

      await telegramService.sendMessage('Test message');

      assert.strictEqual(capturedMessage, 'Telegram API Error:');
      assert.strictEqual(typeof capturedError, 'string');
      assert.ok(!capturedError.includes(botToken), 'Bot token leaked in API error response');
      assert.ok(capturedError.includes('[HIDDEN_TOKEN]'), 'Bot token was not replaced with placeholder');
    });
  });
});
