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
    it('should sanitize sensitive bot token in error objects and strings when fetch fails', async () => {
      const botToken = '123456789:AAH_test_super_secret_bot_token_xyz';
      const config = {
        telegram: {
          botToken: botToken,
          adminId: '123456'
        }
      };

      telegramService = new TelegramService(config);

      // Mock fetch to reject with an error containing the full URL
      global.fetch = async () => {
        const error = new Error(`fetch failed, reason: getaddrinfo ENOTFOUND api.telegram.org https://api.telegram.org/bot${botToken}/sendMessage`);
        error.cause = new Error(`connect ECONNREFUSED https://api.telegram.org/bot${botToken}/sendMessage`);
        throw error;
      };

      let capturedError = null;
      console.error = (message, err) => {
        capturedError = err;
      };

      // Trigger a fetch error by attempting to send a message
      await telegramService.sendMessage('Test message');

      // Ensure error was captured
      assert.ok(capturedError, 'console.error should have been called with an error');

      // Check that the bot token is not in the error message
      assert.strictEqual(
        capturedError.message.includes(botToken),
        false,
        'Error message should not contain the bot token'
      );
      assert.strictEqual(
        capturedError.message.includes('[HIDDEN_TOKEN]'),
        true,
        'Error message should replace token with [HIDDEN_TOKEN]'
      );

      // Check that the bot token is not in the error stack
      assert.strictEqual(
        capturedError.stack.includes(botToken),
        false,
        'Error stack should not contain the bot token'
      );
      assert.strictEqual(
        capturedError.stack.includes('[HIDDEN_TOKEN]'),
        true,
        'Error stack should replace token with [HIDDEN_TOKEN]'
      );

      // Check that the bot token is not in the cause error
      if (capturedError.cause) {
        assert.strictEqual(
          capturedError.cause.message.includes(botToken),
          false,
          'Cause error message should not contain the bot token'
        );
        assert.strictEqual(
          capturedError.cause.message.includes('[HIDDEN_TOKEN]'),
          true,
          'Cause error message should replace token with [HIDDEN_TOKEN]'
        );
      }
    });
  });
});
