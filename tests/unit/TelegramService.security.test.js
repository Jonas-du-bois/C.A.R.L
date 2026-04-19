import { describe, it, beforeEach, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let originalEnv;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalEnv;
  });

  describe('Error logging sanitization behavior', () => {
    const mockToken = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz';
    const config = {
      telegram: {
        botToken: mockToken,
        adminId: '123456'
      }
    };

    let originalConsoleError;
    let consoleErrorOutput;

    beforeEach(() => {
      telegramService = new TelegramService(config);

      originalConsoleError = console.error;
      consoleErrorOutput = [];
      console.error = (...args) => {
        consoleErrorOutput.push(args);
      };
    });

    afterEach(() => {
      console.error = originalConsoleError;
    });

    it('should sanitize API responses containing tokens before logging in sendMessage', async () => {
      global.fetch = async () => ({
        ok: false,
        text: async () => `Unauthorized: Invalid token ${mockToken}`
      });

      await telegramService.sendMessage('test message');

      assert.strictEqual(consoleErrorOutput.length, 1);
      assert.strictEqual(consoleErrorOutput[0][0], 'Telegram API Error:');
      assert.strictEqual(consoleErrorOutput[0][1], 'Unauthorized: Invalid token [HIDDEN_TOKEN]');
    });

    it('should sanitize network errors containing tokens before logging in sendMessage', async () => {
      global.fetch = async () => {
        throw new Error(`fetch failed to reach https://api.telegram.org/bot${mockToken}/sendMessage`);
      };

      await telegramService.sendMessage('test message');

      assert.strictEqual(consoleErrorOutput.length, 1);
      assert.strictEqual(consoleErrorOutput[0][0], 'Failed to send Telegram message:');
      assert.ok(consoleErrorOutput[0][1] instanceof Error);
      assert.strictEqual(consoleErrorOutput[0][1].message, 'fetch failed to reach https://api.telegram.org/bot[HIDDEN_TOKEN]/sendMessage');
    });

    it('should sanitize error objects passed to sendQRCode', async () => {
      global.fetch = async () => ({
        ok: false,
        text: async () => `Invalid token ${mockToken}`
      });

      await telegramService.sendQRCode('mock-data');

      assert.strictEqual(consoleErrorOutput.length, 1);
      assert.strictEqual(consoleErrorOutput[0][0], 'Telegram API Error (QR):');
      assert.strictEqual(consoleErrorOutput[0][1], 'Invalid token [HIDDEN_TOKEN]');
    });

    it('should sanitize fetch network errors in sendQRCode', async () => {
      global.fetch = async () => {
        throw new Error(`Connection refused to bot${mockToken}`);
      };

      await telegramService.sendQRCode('mock-data');

      assert.strictEqual(consoleErrorOutput.length, 1);
      assert.strictEqual(consoleErrorOutput[0][0], 'Failed to send QR code to Telegram:');
      assert.strictEqual(consoleErrorOutput[0][1].message, 'Connection refused to bot[HIDDEN_TOKEN]');
    });

    it('should sanitize nested error causes before logging in answerCallback', async () => {
      global.fetch = async () => {
        const rootCause = new Error(`Root error with ${mockToken}`);
        const middleError = new Error(`Middle error`);
        middleError.cause = rootCause;
        const topError = new Error(`Top error`);
        topError.cause = middleError;
        throw topError;
      };

      await telegramService.answerCallback('callback_123', 'test');

      assert.strictEqual(consoleErrorOutput.length, 1);
      assert.strictEqual(consoleErrorOutput[0][0], 'Failed to answer callback:');

      const loggedError = consoleErrorOutput[0][1];
      assert.strictEqual(loggedError.message, 'Top error');
      assert.strictEqual(loggedError.cause.message, 'Middle error');
      assert.strictEqual(loggedError.cause.cause.message, 'Root error with [HIDDEN_TOKEN]');
    });
  });
});
