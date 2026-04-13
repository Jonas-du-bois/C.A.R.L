import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService - Security', () => {
  let originalConsoleError;
  let errorOutput;

  beforeEach(() => {
    originalConsoleError = console.error;
    errorOutput = [];
    console.error = (...args) => {
      errorOutput.push(args);
    };
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should sanitize botToken from strings and error objects', async () => {
    const config = {
      telegram: {
        botToken: 'secret-token-123',
        adminId: 'admin123'
      }
    };

    // We will test answerCallback to trigger #sanitizeError indirectly
    const service = new TelegramService(config);

    // Mock fetch to throw an error containing the token
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      throw new Error(`Failed to reach https://api.telegram.org/botsecret-token-123/endpoint`);
    };

    try {
      await service.answerCallback('12345');

      // The error should have been caught and logged
      assert.strictEqual(errorOutput.length, 1);
      const [msg, err] = errorOutput[0];

      assert.strictEqual(msg, 'Failed to answer callback:');
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'Failed to reach https://api.telegram.org/bot[HIDDEN_TOKEN]/endpoint');
      assert.ok(!err.message.includes('secret-token-123'));

      // Also check the stack
      assert.ok(err.stack.includes('[HIDDEN_TOKEN]'));
      assert.ok(!err.stack.includes('secret-token-123'));

    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should sanitize nested errors (cause)', async () => {
    const config = {
      telegram: {
        botToken: 'super-secret',
        adminId: 'admin123'
      }
    };

    const service = new TelegramService(config);

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const innerError = new Error('inner super-secret error');
      const err = new Error('outer super-secret error');
      err.cause = innerError;
      throw err;
    };

    try {
      await service.answerCallback('12345');

      assert.strictEqual(errorOutput.length, 1);
      const err = errorOutput[0][1];

      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'outer [HIDDEN_TOKEN] error');
      assert.ok(err.cause instanceof Error);
      assert.strictEqual(err.cause.message, 'inner [HIDDEN_TOKEN] error');

    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should handle string errors', async () => {
    const config = {
      telegram: {
        botToken: 'string-secret',
        adminId: 'admin123'
      }
    };

    const service = new TelegramService(config);

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      // Simulate fetch failing with a response that is a string containing token
      return {
        ok: false,
        text: async () => 'Error with string-secret token'
      };
    };

    try {
      await service.sendMessage('test');

      assert.strictEqual(errorOutput.length, 1);
      const msg = errorOutput[0][0];
      const err = errorOutput[0][1];

      assert.strictEqual(msg, 'Telegram API Error:');
      assert.strictEqual(err, 'Error with [HIDDEN_TOKEN] token');

    } finally {
      global.fetch = originalFetch;
    }
  });
});
