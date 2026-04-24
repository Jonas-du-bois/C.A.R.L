import { describe, it, beforeEach, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;

  const BOT_TOKEN = 'secret-bot-token-12345';
  const ADMIN_ID = 'admin-id-67890';
  const HIDDEN_TOKEN = '[HIDDEN_TOKEN]';

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;

    telegramService = new TelegramService({
      telegram: {
        botToken: BOT_TOKEN,
        adminId: ADMIN_ID
      }
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  describe('#sanitizeError (via sendMessage)', () => {
    it('should sanitize bot token from string error', async () => {
      let loggedError;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async (url) => ({
        ok: false,
        text: async () => `Token is ${BOT_TOKEN}`
      });

      await telegramService.sendMessage('Test message');

      assert.ok(loggedError.includes(HIDDEN_TOKEN));
      assert.ok(!loggedError.includes(BOT_TOKEN));
    });

    it('should sanitize bot token from Error object message', async () => {
      let loggedError;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async (url) => {
        throw new Error(`Fetch failed for URL containing ${BOT_TOKEN}`);
      };

      await telegramService.sendMessage('Test message');

      assert.ok(loggedError instanceof Error);
      assert.ok(loggedError.message.includes(HIDDEN_TOKEN));
      assert.ok(!loggedError.message.includes(BOT_TOKEN));
    });

    it('should sanitize bot token from Error object stack and cause', async () => {
      let loggedError;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async (url) => {
        const rootError = new Error(`Root cause involving ${BOT_TOKEN}`);
        const fetchError = new Error(`Network failure on ${BOT_TOKEN}`, { cause: rootError });
        fetchError.stack = `Error: Network failure on ${BOT_TOKEN}\n    at global.fetch`;
        throw fetchError;
      };

      await telegramService.sendMessage('Test message');

      assert.ok(loggedError instanceof Error);
      assert.ok(loggedError.message.includes(HIDDEN_TOKEN));
      assert.ok(!loggedError.message.includes(BOT_TOKEN));
      assert.ok(loggedError.stack.includes(HIDDEN_TOKEN));
      assert.ok(!loggedError.stack.includes(BOT_TOKEN));

      assert.ok(loggedError.cause, "Cause should be preserved");
      assert.ok(loggedError.cause.message.includes(HIDDEN_TOKEN));
      assert.ok(!loggedError.cause.message.includes(BOT_TOKEN));
    });
  });
});
