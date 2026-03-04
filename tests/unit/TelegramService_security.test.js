import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('sendMessage (security)', () => {
    it('should not leak the bot token in logs or error messages', async () => {
      // Mock console.error to intercept logs
      let loggedError;
      const originalConsoleError = console.error;
      console.error = (...args) => {
        loggedError = args.join(' ');
      };

      const config = {
        telegram: {
          botToken: 'S3CR3T_B0T_T0K3N',
          adminId: '123456'
        }
      };

      telegramService = new TelegramService(config);

      global.fetch = async (url) => {
        // Simulate a network error that might include the URL in the error message
        throw new Error(`Failed to fetch from ${url}`);
      };

      try {
        await telegramService.sendMessage('Test message');
      } finally {
        console.error = originalConsoleError;
      }

      assert.ok(!loggedError.includes('S3CR3T_B0T_T0K3N'), 'Bot token should not be leaked in error logs');
    });
  });
});
