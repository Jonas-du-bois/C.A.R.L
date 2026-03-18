import { describe, it, beforeEach, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;
  let errorLogs;

  const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const config = {
    telegram: {
      botToken: botToken,
      adminId: '987654'
    }
  };

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    errorLogs = [];
    console.error = (...args) => {
      errorLogs.push(args);
    };
    telegramService = new TelegramService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should not leak bot token in sendMessage network errors', async () => {
    global.fetch = async () => {
      throw new Error(`Failed to fetch https://api.telegram.org/bot${botToken}/sendMessage`);
    };

    await telegramService.sendMessage('Test Message');

    assert.strictEqual(errorLogs.length, 1);
    const log = errorLogs[0];
    assert.strictEqual(log[0], 'Failed to send Telegram message:');

    const errorObj = log[1];
    assert.ok(errorObj instanceof Error);
    assert.ok(!errorObj.message.includes(botToken), 'Bot token should be scrubbed from error message');
    assert.ok(errorObj.message.includes('[HIDDEN_TOKEN]'), 'Bot token should be replaced with [HIDDEN_TOKEN]');

    if (errorObj.stack) {
      assert.ok(!errorObj.stack.includes(botToken), 'Bot token should be scrubbed from error stack');
    }
  });

  it('should not leak bot token in API text responses', async () => {
    global.fetch = async () => ({
      ok: false,
      text: async () => `{"ok":false,"error_code":401,"description":"Unauthorized for token ${botToken}"}`
    });

    await telegramService.sendMessage('Test Message');

    assert.strictEqual(errorLogs.length, 1);
    const log = errorLogs[0];
    assert.strictEqual(log[0], 'Telegram API Error:');

    const errorStr = log[1];
    assert.strictEqual(typeof errorStr, 'string');
    assert.ok(!errorStr.includes(botToken), 'Bot token should be scrubbed from API error string');
    assert.ok(errorStr.includes('[HIDDEN_TOKEN]'), 'Bot token should be replaced with [HIDDEN_TOKEN]');
  });

  it('should recursively sanitize nested Error causes', async () => {
    global.fetch = async () => {
      const rootError = new Error('Root error');
      const innerError = new Error(`Inner error with token ${botToken}`);
      innerError.cause = `String cause with token ${botToken}`;
      rootError.cause = innerError;
      throw rootError;
    };

    await telegramService.sendMessage('Test Message');

    assert.strictEqual(errorLogs.length, 1);
    const log = errorLogs[0];
    const errorObj = log[1];

    assert.ok(errorObj instanceof Error);
    assert.ok(errorObj.cause instanceof Error);
    assert.ok(!errorObj.cause.message.includes(botToken), 'Bot token should be scrubbed from nested error message');
    assert.ok(errorObj.cause.message.includes('[HIDDEN_TOKEN]'));

    assert.strictEqual(typeof errorObj.cause.cause, 'string');
    assert.ok(!errorObj.cause.cause.includes(botToken), 'Bot token should be scrubbed from nested string cause');
    assert.ok(errorObj.cause.cause.includes('[HIDDEN_TOKEN]'));
  });

  it('should not mutate original object to a new instance (preserves custom properties)', async () => {
    let originalError;
    global.fetch = async () => {
      originalError = new Error(`Error with token ${botToken}`);
      originalError.customCode = 1234;
      throw originalError;
    };

    await telegramService.sendMessage('Test Message');

    assert.strictEqual(errorLogs.length, 1);
    const errorObj = errorLogs[0][1];

    assert.notStrictEqual(errorObj, originalError, 'Should return a new Error instance');
    assert.strictEqual(errorObj.customCode, 1234, 'Custom properties should be preserved');
    assert.ok(originalError.message.includes(botToken), 'Original error should not be mutated');
  });
});
