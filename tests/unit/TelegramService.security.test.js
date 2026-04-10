import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let consoleErrorMock;
  let loggedErrors;

  beforeEach(() => {
    originalFetch = global.fetch;
    loggedErrors = [];
    consoleErrorMock = (...args) => {
      // join args with spaces, and for error objects log their stack/message to simulate real console.error
      const logStr = args.map(a => a instanceof Error ? (a.stack || a.message) : String(a)).join(' ');
      loggedErrors.push(logStr);
    };
    global.console.error = consoleErrorMock;

    telegramService = new TelegramService({
      telegram: {
        botToken: 'SECRET-TELEGRAM.TOKEN*123',
        adminId: '12345'
      }
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete global.console.error;
  });

  it('should not leak botToken in sendMessage errors', async () => {
    global.fetch = async () => {
      return {
        ok: false,
        text: async () => '{"ok":false,"error_code":401,"description":"Unauthorized"}'
      };
    };

    await telegramService.sendMessage('Test');
    assert.strictEqual(loggedErrors.length > 0, true, "Should have logged an error");

    for (const log of loggedErrors) {
      assert.strictEqual(log.includes('SECRET-TELEGRAM.TOKEN*123'), false, "Leaked token in log!");
    }
  });

  it('should not leak botToken when fetch throws an exception', async () => {
    global.fetch = async () => {
      throw new Error('fetch failed: https://api.telegram.org/botSECRET-TELEGRAM.TOKEN*123/sendMessage');
    };

    await telegramService.sendMessage('Test');
    assert.strictEqual(loggedErrors.length > 0, true, "Should have logged an error");

    for (const log of loggedErrors) {
      assert.strictEqual(log.includes('SECRET-TELEGRAM.TOKEN*123'), false, "Leaked token in log!");
    }
  });
});

  it('should not throw if botToken is not set', async () => {
    const s = new TelegramService({ telegram: { adminId: '123' } });
    global.fetch = async () => { throw new Error('Network error'); };
    await s.sendMessage('test'); // Will not send due to missing token, but shouldn't throw when trying to sanitize error in catch
    assert.ok(true);
  });
