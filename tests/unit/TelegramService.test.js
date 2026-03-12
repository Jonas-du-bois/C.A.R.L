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

    it('should sanitize bot token from fetch errors', async () => {
      const config = {
        telegram: {
          botToken: 'secret-token-123',
          adminId: '123456'
        }
      };

      telegramService = new TelegramService(config);

      global.fetch = async () => {
        throw new Error('fetch failed: https://api.telegram.org/botsecret-token-123/sendMessage');
      };

      let capturedError = null;
      const originalConsoleError = console.error;
      console.error = (msg, err) => {
        capturedError = err;
      };

      await telegramService.sendMessage('Test message');
      console.error = originalConsoleError;

      assert.ok(capturedError instanceof Error);
      assert.strictEqual(
        capturedError.message.includes('secret-token-123'),
        false,
        'Error message should not contain the secret token'
      );
      assert.strictEqual(
        capturedError.message.includes('[HIDDEN_TOKEN]'),
        true,
        'Error message should contain [HIDDEN_TOKEN]'
      );
      assert.strictEqual(
        capturedError.stack.includes('secret-token-123'),
        false,
        'Error stack should not contain the secret token'
      );
    });
  });
});

function afterEach(fn) {
  // Simple cleanup helper for tests
  process.on('exit', fn);
}
