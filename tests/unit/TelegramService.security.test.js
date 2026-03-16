import { describe, it, beforeEach, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let originalConsoleError;

  beforeEach(() => {
    originalConsoleError = console.error;
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe('#sanitizeError via public methods', () => {
    it('should sanitize bot token from error logs in sendMessage on API error', async () => {
      const config = {
        telegram: {
          botToken: 'secret-token-123',
          adminId: '123456'
        }
      };
      const service = new TelegramService(config);

      global.fetch = async () => ({
        ok: false,
        text: async () => 'Unauthorized for secret-token-123 API'
      });

      let loggedError = null;
      console.error = (msg, err) => {
        if (msg === 'Telegram API Error:') {
          loggedError = err;
        }
      };

      await service.sendMessage('test message');

      assert.strictEqual(loggedError, 'Unauthorized for [HIDDEN_TOKEN] API');
      assert.ok(!loggedError.includes('secret-token-123'));
    });

    it('should sanitize bot token from error logs in sendMessage on fetch throw', async () => {
      const config = {
        telegram: {
          botToken: 'secret-token-123',
          adminId: '123456'
        }
      };
      const service = new TelegramService(config);

      const error = new Error('Network error on https://api.telegram.org/botsecret-token-123/sendMessage');
      error.stack = 'Stack trace with secret-token-123 inside';
      global.fetch = async () => {
        throw error;
      };

      let loggedError = null;
      console.error = (msg, err) => {
        if (msg === 'Failed to send Telegram message:') {
          loggedError = err;
        }
      };

      await service.sendMessage('test message');

      assert.strictEqual(loggedError, error);
      assert.strictEqual(loggedError.message, 'Network error on https://api.telegram.org/bot[HIDDEN_TOKEN]/sendMessage');
      assert.ok(!loggedError.message.includes('secret-token-123'));
      assert.ok(!loggedError.stack.includes('secret-token-123'));
      assert.ok(loggedError.stack.includes('[HIDDEN_TOKEN]'));
    });

    it('should sanitize nested causes in sendQRCode on fetch throw', async () => {
      const config = {
        telegram: {
          botToken: 'secret-token-123',
          adminId: '123456'
        }
      };
      const service = new TelegramService(config);

      const rootError = new Error('Failed generating QR code');
      const causeError = new Error('URL secret-token-123 not reachable');
      causeError.stack = 'cause stack with secret-token-123';
      rootError.cause = causeError;

      global.fetch = async () => {
        throw rootError;
      };

      let loggedError = null;
      console.error = (msg, err) => {
        if (msg === 'Failed to send QR code to Telegram:') {
          loggedError = err;
        }
      };

      await service.sendQRCode('dummy-qr-data');

      assert.strictEqual(loggedError, rootError);
      assert.strictEqual(loggedError.cause.message, 'URL [HIDDEN_TOKEN] not reachable');
      assert.ok(!loggedError.cause.message.includes('secret-token-123'));
      assert.ok(!loggedError.cause.stack.includes('secret-token-123'));
    });

    it('should sanitize bot token in answerCallback on fetch throw', async () => {
      const tokenWithSpecialChars = 'secret.token+with*special(chars)[123]';
      const config = {
        telegram: {
          botToken: tokenWithSpecialChars,
          adminId: '123456'
        }
      };
      const service = new TelegramService(config);

      const errorStr = `Error answering callback with bot${tokenWithSpecialChars}/api`;

      global.fetch = async () => {
        throw errorStr; // Throwing a string here directly to test string sanitization
      };

      let loggedError = null;
      console.error = (msg, err) => {
        if (msg === 'Failed to answer callback:') {
          loggedError = err;
        }
      };

      await service.answerCallback('123', 'text');

      assert.strictEqual(loggedError, 'Error answering callback with bot[HIDDEN_TOKEN]/api');
      assert.ok(!loggedError.includes(tokenWithSpecialChars));
    });
  });
});
