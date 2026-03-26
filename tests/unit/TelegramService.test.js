import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService', () => {
  let telegramService;
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('sendMessage', () => {
    it('should not send if bot token is missing', async () => {
      const config = {
        telegram: {
          botToken: null,
          adminId: '123456'
        }
      };
      
      telegramService = new TelegramService(config);
      
      let fetchCalled = false;
      global.fetch = () => {
        fetchCalled = true;
        return Promise.resolve({ ok: true });
      };
      
      await telegramService.sendMessage('Test message');
      
      assert.strictEqual(fetchCalled, false);
    });

    it('should not send if admin id is missing', async () => {
      const config = {
        telegram: {
          botToken: 'test-token',
          adminId: null
        }
      };
      
      telegramService = new TelegramService(config);
      
      let fetchCalled = false;
      global.fetch = () => {
        fetchCalled = true;
        return Promise.resolve({ ok: true });
      };
      
      await telegramService.sendMessage('Test message');
      
      assert.strictEqual(fetchCalled, false);
    });

    it('should send message when properly configured', async () => {
      const config = {
        telegram: {
          botToken: 'test-token',
          adminId: '123456'
        }
      };
      
      telegramService = new TelegramService(config);
      
      let capturedUrl = null;
      let capturedBody = null;
      
      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedBody = JSON.parse(options.body);
        return { ok: true };
      };
      
      await telegramService.sendMessage('Hello World');
      
      assert.strictEqual(capturedUrl, 'https://api.telegram.org/bottest-token/sendMessage');
      assert.deepStrictEqual(capturedBody, {
        chat_id: '123456',
        text: 'Hello World',
        parse_mode: 'HTML'
      });
    });

    it('should handle fetch errors gracefully', async () => {
      const config = {
        telegram: {
          botToken: 'test-token',
          adminId: '123456'
        }
      };
      
      telegramService = new TelegramService(config);
      
      global.fetch = async () => {
        throw new Error('Network error');
      };
      
      // Should not throw
      await telegramService.sendMessage('Test message');
    });

    it('should log error when API returns non-ok response', async () => {
      const config = {
        telegram: {
          botToken: 'test-token',
          adminId: '123456'
        }
      };
      
      telegramService = new TelegramService(config);
      
      global.fetch = async () => ({
        ok: false,
        text: async () => 'Unauthorized'
      });
      
      // Should not throw
      await telegramService.sendMessage('Test message');
    });
  });

  describe('Security (Sanitization)', () => {
    let originalConsoleError;
    let consoleErrors = [];

    beforeEach(() => {
      originalConsoleError = console.error;
      console.error = (...args) => {
        consoleErrors.push(args);
      };
      consoleErrors = [];
    });

    afterEach(() => {
      if (originalConsoleError) {
        console.error = originalConsoleError;
      }
    });

    it('should sanitize the bot token from error strings', async () => {
      const config = {
        telegram: {
          botToken: 'secret-token-123',
          adminId: '123456'
        }
      };

      telegramService = new TelegramService(config);

      global.fetch = async () => ({
        ok: false,
        text: async () => 'Error accessing https://api.telegram.org/botsecret-token-123/sendMessage'
      });

      await telegramService.sendMessage('Test message');

      assert.strictEqual(consoleErrors.length, 1);
      assert.strictEqual(consoleErrors[0][0], 'Telegram API Error:');
      assert.strictEqual(consoleErrors[0][1], 'Error accessing https://api.telegram.org/bot[HIDDEN_TOKEN]/sendMessage');
    });

    it('should sanitize the bot token from Error objects (message and stack)', async () => {
      const config = {
        telegram: {
          botToken: 'secret-token-456',
          adminId: '123456'
        }
      };

      telegramService = new TelegramService(config);

      global.fetch = async () => {
        const error = new Error('fetch failed: https://api.telegram.org/botsecret-token-456/sendMessage');
        error.stack = 'Error: fetch failed: https://api.telegram.org/botsecret-token-456/sendMessage\n    at global.fetch...';
        throw error;
      };

      await telegramService.sendMessage('Test message');

      assert.strictEqual(consoleErrors.length, 1);
      assert.strictEqual(consoleErrors[0][0], 'Failed to send Telegram message:');
      const loggedError = consoleErrors[0][1];

      assert.strictEqual(loggedError.message, 'fetch failed: https://api.telegram.org/bot[HIDDEN_TOKEN]/sendMessage');
      assert.ok(loggedError.stack.includes('[HIDDEN_TOKEN]'));
      assert.strictEqual(loggedError.stack.includes('secret-token-456'), false);
      assert.strictEqual(loggedError.name, 'Error'); // Preserves error type
    });

    it('should sanitize the bot token from nested Error causes', async () => {
      const config = {
        telegram: {
          botToken: 'secret-token-789',
          adminId: '123456'
        }
      };

      telegramService = new TelegramService(config);

      global.fetch = async () => {
        const cause = new Error('inner network error for botsecret-token-789');
        const error = new Error('outer error');
        error.cause = cause;
        throw error;
      };

      await telegramService.sendMessage('Test message');

      assert.strictEqual(consoleErrors.length, 1);
      const loggedError = consoleErrors[0][1];

      assert.strictEqual(loggedError.message, 'outer error'); // Unchanged
      assert.ok(loggedError.cause);
      assert.strictEqual(loggedError.cause.message, 'inner network error for bot[HIDDEN_TOKEN]');
    });

    it('should sanitize the bot token from custom error properties', async () => {
      const config = {
        telegram: {
          botToken: 'secret-token-xyz',
          adminId: '123456'
        }
      };

      telegramService = new TelegramService(config);

      global.fetch = async () => {
        const error = new Error('failed');
        error.url = 'https://api.telegram.org/botsecret-token-xyz/sendMessage';
        error.status = 401; // Number should be preserved untouched
        throw error;
      };

      await telegramService.sendMessage('Test message');

      assert.strictEqual(consoleErrors.length, 1);
      const loggedError = consoleErrors[0][1];

      assert.strictEqual(loggedError.url, 'https://api.telegram.org/bot[HIDDEN_TOKEN]/sendMessage');
      assert.strictEqual(loggedError.status, 401);
    });
  });
});

function afterEach(fn) {
  // Simple cleanup helper for tests
  process.on('exit', fn);
}
