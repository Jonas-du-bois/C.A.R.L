import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;
  const botToken = 'SECRET-BOT-TOKEN-12345';
  const hiddenToken = '[HIDDEN_TOKEN]';

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;

    const config = {
      telegram: {
        botToken: botToken,
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
    it('should sanitize bot token from string error in sendMessage', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => ({
        ok: false,
        text: async () => `API Error: Invalid token ${botToken} at endpoint /bot${botToken}/sendMessage`
      });

      await telegramService.sendMessage('Test');

      assert.ok(loggedError);
      assert.ok(loggedError.includes(hiddenToken));
      assert.ok(!loggedError.includes(botToken));
    });

    it('should sanitize bot token from Error object in sendMessage', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => {
        throw new Error(`Network Error to https://api.telegram.org/bot${botToken}/sendMessage`);
      };

      await telegramService.sendMessage('Test');

      assert.ok(loggedError instanceof Error);
      assert.ok(loggedError.message.includes(hiddenToken));
      assert.ok(!loggedError.message.includes(botToken));
    });

    it('should sanitize bot token from error stack in sendMessage', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => {
        const error = new Error('Test error');
        error.stack = `Error: Test error\n    at fetch (https://api.telegram.org/bot${botToken}/sendMessage:1:1)`;
        throw error;
      };

      await telegramService.sendMessage('Test');

      assert.ok(loggedError instanceof Error);
      assert.ok(loggedError.stack.includes(hiddenToken));
      assert.ok(!loggedError.stack.includes(botToken));
    });

    it('should sanitize bot token from error cause in sendMessage', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => {
        const innerError = new Error(`Inner error with token ${botToken}`);
        const error = new Error('Outer error');
        error.cause = innerError;
        throw error;
      };

      await telegramService.sendMessage('Test');

      assert.ok(loggedError instanceof Error);
      assert.ok(loggedError.cause instanceof Error);
      assert.ok(loggedError.cause.message.includes(hiddenToken));
      assert.ok(!loggedError.cause.message.includes(botToken));
    });

    it('should sanitize bot token from string error in answerCallback', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => ({
        ok: false,
        text: async () => `API Error: Invalid token ${botToken}`
      });

      await telegramService.answerCallback('123', 'Test');

      assert.ok(loggedError);
      assert.ok(loggedError.includes(hiddenToken));
      assert.ok(!loggedError.includes(botToken));
    });

    it('should sanitize bot token from Error object in answerCallback', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => {
        throw new Error(`Network Error: /bot${botToken}/`);
      };

      await telegramService.answerCallback('123', 'Test');

      assert.ok(loggedError instanceof Error);
      assert.ok(loggedError.message.includes(hiddenToken));
      assert.ok(!loggedError.message.includes(botToken));
    });

    it('should sanitize bot token from string error in sendQRCode', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => ({
        ok: false,
        text: async () => `API Error: Token ${botToken} rejected`
      });

      await telegramService.sendQRCode('dummy-qr-data');

      assert.ok(loggedError);
      assert.ok(loggedError.includes(hiddenToken));
      assert.ok(!loggedError.includes(botToken));
    });

    it('should sanitize bot token from Error object in sendQRCode', async () => {
      let loggedError = null;
      console.error = (msg, err) => {
        loggedError = err;
      };

      global.fetch = async () => {
        throw new Error(`Connection failed to /bot${botToken}/sendPhoto`);
      };

      await telegramService.sendQRCode('dummy-qr-data');

      assert.ok(loggedError instanceof Error);
      assert.ok(loggedError.message.includes(hiddenToken));
      assert.ok(!loggedError.message.includes(botToken));
    });
  });
});
