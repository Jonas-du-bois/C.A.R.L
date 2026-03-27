import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security Tests', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;
  const SECRET_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;

    const config = {
      telegram: {
        botToken: SECRET_TOKEN,
        adminId: '123456'
      }
    };

    telegramService = new TelegramService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  describe('botToken sanitization', () => {
    it('should sanitize bot token from string error responses in sendMessage', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => ({
        ok: false,
        text: async () => `Error: Invalid token ${SECRET_TOKEN} used for request`
      });

      await telegramService.sendMessage('Test message');

      assert.ok(loggedError !== null, 'Should have logged an error');
      assert.strictEqual(
        loggedError.includes(SECRET_TOKEN),
        false,
        'Original secret token should not be in the logged error string'
      );
      assert.ok(
        loggedError.includes('[HIDDEN_TOKEN]'),
        'Sanitized token marker should be present'
      );
    });

    it('should sanitize bot token from Error object message and stack in fetch catch block', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => {
        const err = new Error(`Network failure for url: https://api.telegram.org/bot${SECRET_TOKEN}/sendMessage`);
        err.stack = `Error: Network failure for url: https://api.telegram.org/bot${SECRET_TOKEN}/sendMessage\n    at global.fetch...`;
        throw err;
      };

      await telegramService.sendMessage('Test message');

      assert.ok(loggedError instanceof Error, 'Should have logged an Error object');
      assert.strictEqual(
        loggedError.message.includes(SECRET_TOKEN),
        false,
        'Original secret token should not be in the error message'
      );
      assert.ok(
        loggedError.message.includes('[HIDDEN_TOKEN]'),
        'Sanitized token marker should be present in message'
      );

      if (loggedError.stack) {
        assert.strictEqual(
          loggedError.stack.includes(SECRET_TOKEN),
          false,
          'Original secret token should not be in the error stack'
        );
        assert.ok(
          loggedError.stack.includes('[HIDDEN_TOKEN]'),
          'Sanitized token marker should be present in stack'
        );
      }
    });

    it('should recursively sanitize cause Error objects', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => {
        const cause = new Error(`Inner error with token: ${SECRET_TOKEN}`);
        const err = new Error(`Outer error`);
        err.cause = cause;
        throw err;
      };

      await telegramService.sendMessage('Test message');

      assert.ok(loggedError instanceof Error, 'Should have logged an Error object');
      assert.ok(loggedError.cause instanceof Error, 'Sanitized error should have a cause');
      assert.strictEqual(
        loggedError.cause.message.includes(SECRET_TOKEN),
        false,
        'Original secret token should not be in the cause error message'
      );
      assert.ok(
        loggedError.cause.message.includes('[HIDDEN_TOKEN]'),
        'Sanitized token marker should be present in cause message'
      );
    });

    it('should preserve original Error type', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => {
        const err = new TypeError(`Type error involving token: ${SECRET_TOKEN}`);
        throw err;
      };

      await telegramService.sendMessage('Test message');

      assert.ok(loggedError instanceof Error, 'Should have logged an Error object');
      assert.strictEqual(loggedError.name, 'TypeError', 'Should preserve original error name');
    });
  });
});
