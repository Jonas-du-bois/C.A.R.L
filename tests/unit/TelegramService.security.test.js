import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;
  const SECRET_TOKEN = 'secret-bot-token-12345';

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  describe('Secret Token Redaction', () => {
    it('should redact botToken from string errors in API error responses', async () => {
      const config = {
        telegram: {
          botToken: SECRET_TOKEN,
          adminId: '123456'
        }
      };
      telegramService = new TelegramService(config);

      // Mock fetch to simulate a failed request returning the token in the body
      global.fetch = async () => ({
        ok: false,
        text: async () => `Error: Invalid request to https://api.telegram.org/bot${SECRET_TOKEN}/sendMessage`
      });

      let loggedError = null;
      console.error = (msg, err) => {
        if (msg === 'Telegram API Error:') {
          loggedError = err;
        }
      };

      // Call public method that triggers fetch
      await telegramService.sendMessage('Test message');

      assert.ok(loggedError, 'Expected console.error to be called with API error');
      assert.strictEqual(loggedError.includes(SECRET_TOKEN), false, 'Token should be redacted from string');
      assert.strictEqual(loggedError.includes('[HIDDEN_TOKEN]'), true, 'Token should be replaced with [HIDDEN_TOKEN]');
    });

    it('should redact botToken from Error objects thrown by fetch', async () => {
      const config = {
        telegram: {
          botToken: SECRET_TOKEN,
          adminId: '123456'
        }
      };
      telegramService = new TelegramService(config);

      // Mock fetch to throw an Error containing the token
      global.fetch = async () => {
        const error = new Error(`Network failed to reach https://api.telegram.org/bot${SECRET_TOKEN}/sendMessage`);
        error.cause = new Error(`Nested cause with token: ${SECRET_TOKEN}`);
        error.customUrl = `Url: ${SECRET_TOKEN}`;
        throw error;
      };

      let loggedError = null;
      console.error = (msg, err) => {
        if (msg === 'Failed to send Telegram message:') {
          loggedError = err;
        }
      };

      await telegramService.sendMessage('Test message');

      assert.ok(loggedError, 'Expected console.error to be called with thrown error');
      assert.ok(loggedError instanceof Error, 'Sanitized error should still be an Error instance');

      // Check message
      assert.strictEqual(loggedError.message.includes(SECRET_TOKEN), false);
      assert.strictEqual(loggedError.message.includes('[HIDDEN_TOKEN]'), true);

      // Check stack
      if (loggedError.stack) {
        assert.strictEqual(loggedError.stack.includes(SECRET_TOKEN), false);
      }

      // Check cause
      assert.ok(loggedError.cause instanceof Error);
      assert.strictEqual(loggedError.cause.message.includes(SECRET_TOKEN), false);
      assert.strictEqual(loggedError.cause.message.includes('[HIDDEN_TOKEN]'), true);

      // Check custom properties
      assert.strictEqual(loggedError.customUrl.includes(SECRET_TOKEN), false);
      assert.strictEqual(loggedError.customUrl.includes('[HIDDEN_TOKEN]'), true);
    });
  });
});
