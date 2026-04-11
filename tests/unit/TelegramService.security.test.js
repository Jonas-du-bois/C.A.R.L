import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security - Error Sanitization', () => {
  let originalFetch;
  let originalConsoleError;
  let loggedErrors;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    loggedErrors = [];

    // Mock console.error to capture logged messages
    console.error = (...args) => {
      loggedErrors.push(args);
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should sanitize bot token from string and error objects on fetch failure in answerCallback', async () => {
    const token = '123456789:ABCDefghIJKLmnopQRSTuvwxYZ';
    const service = new TelegramService({
      telegram: {
        botToken: token,
        adminId: '123456789'
      }
    });

    // Mock fetch to throw an error containing the token
    global.fetch = async (url) => {
      // Create an error that leaks the token
      const leakError = new Error(`Failed to fetch https://api.telegram.org/bot${token}/answerCallbackQuery`);
      leakError.cause = new Error(`Connection refused to bot${token}`);
      throw leakError;
    };

    // Trigger the failure
    await service.answerCallback('callback_id_123', 'test');

    // Assert that console.error was called
    assert.strictEqual(loggedErrors.length, 1, 'console.error should be called once');

    // The second argument is the sanitized error
    const loggedError = loggedErrors[0][1];

    assert.ok(loggedError instanceof Error, 'Logged error should be an Error instance');
    assert.ok(!loggedError.message.includes(token), 'Token should be sanitized from error message');
    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'), 'Token should be replaced with [HIDDEN_TOKEN] in message');

    assert.ok(!loggedError.stack.includes(token), 'Token should be sanitized from error stack');

    assert.ok(loggedError.cause instanceof Error, 'Cause should be an Error instance');
    assert.ok(!loggedError.cause.message.includes(token), 'Token should be sanitized from cause message');
    assert.ok(loggedError.cause.message.includes('[HIDDEN_TOKEN]'), 'Token should be replaced with [HIDDEN_TOKEN] in cause');
  });

  it('should sanitize bot token from error text on bad response in sendMessage', async () => {
    const token = '123456789:ABCDefghIJKLmnopQRSTuvwxYZ';
    const service = new TelegramService({
      telegram: {
        botToken: token,
        adminId: '123456789'
      }
    });

    // Mock fetch to return a non-ok response with a leaking text body
    global.fetch = async (url) => {
      return {
        ok: false,
        text: async () => `Bad request for token ${token}`
      };
    };

    // Trigger the failure
    await service.sendMessage('test message');

    // Assert that console.error was called
    assert.strictEqual(loggedErrors.length, 1, 'console.error should be called once');

    // The second argument is the sanitized text error
    const loggedErrorText = loggedErrors[0][1];

    assert.strictEqual(typeof loggedErrorText, 'string', 'Logged error should be a string');
    assert.ok(!loggedErrorText.includes(token), 'Token should be sanitized from text error');
    assert.ok(loggedErrorText.includes('[HIDDEN_TOKEN]'), 'Token should be replaced with [HIDDEN_TOKEN] in text error');
  });
});
