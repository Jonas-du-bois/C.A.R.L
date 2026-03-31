import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security Tests', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;

  const botToken = '123456789:AAH_abcdefghijklmnopqrstuvwxyz12345';
  const config = {
    telegram: {
      botToken: botToken,
      adminId: '123456'
    }
  };

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    telegramService = new TelegramService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    mock.restoreAll();
  });

  it('should not leak botToken in console.error when fetch fails with an Error', async () => {
    const errorWithToken = new Error(`Network error on https://api.telegram.org/bot${botToken}/sendMessage`);
    errorWithToken.cause = new Error(`Cause error with token ${botToken}`);
    errorWithToken.customProp = `Some value with ${botToken}`;

    global.fetch = mock.fn(() => Promise.reject(errorWithToken));

    let capturedError = null;
    console.error = mock.fn((msg, err) => {
      capturedError = err;
    });

    await telegramService.sendMessage('Test');

    assert.strictEqual(console.error.mock.calls.length > 0, true);
    assert.notStrictEqual(capturedError, null);

    // Check that original error is not mutated
    assert.ok(errorWithToken.message.includes(botToken));
    assert.ok(errorWithToken.cause.message.includes(botToken));
    assert.ok(errorWithToken.customProp.includes(botToken));

    // Check that captured error is sanitized
    assert.ok(!capturedError.message.includes(botToken));
    assert.ok(capturedError.message.includes('[HIDDEN_TOKEN]'));
    assert.strictEqual(capturedError.name, 'Error');

    assert.ok(!capturedError.cause.message.includes(botToken));
    assert.ok(capturedError.cause.message.includes('[HIDDEN_TOKEN]'));

    assert.ok(!capturedError.customProp.includes(botToken));
    assert.ok(capturedError.customProp.includes('[HIDDEN_TOKEN]'));

    if (capturedError.stack) {
      assert.ok(!capturedError.stack.includes(botToken));
      assert.ok(capturedError.stack.includes('[HIDDEN_TOKEN]'));
    }
  });

  it('should not leak botToken in console.error when response is not ok and text contains token', async () => {
    const stringError = `Unauthorized access to bot ${botToken}`;
    global.fetch = mock.fn(() => Promise.resolve({
      ok: false,
      text: () => Promise.resolve(stringError)
    }));

    let capturedError = null;
    console.error = mock.fn((msg, err) => {
      capturedError = err;
    });

    await telegramService.sendMessage('Test');

    assert.strictEqual(console.error.mock.calls.length > 0, true);
    assert.ok(typeof capturedError === 'string');
    assert.ok(!capturedError.includes(botToken));
    assert.ok(capturedError.includes('[HIDDEN_TOKEN]'));
  });

  it('should handle non-Error, non-string objects gracefully', async () => {
    const objError = { foo: `bar ${botToken}` };
    global.fetch = mock.fn(() => Promise.reject(objError));

    let capturedError = null;
    console.error = mock.fn((msg, err) => {
      capturedError = err;
    });

    await telegramService.sendMessage('Test');

    assert.strictEqual(console.error.mock.calls.length > 0, true);
    assert.notStrictEqual(capturedError, null);
    // Since it's a plain object, it might be stringified or just have its string properties replaced
    // The requirement says "Error objects... and strings", let's see how our sanitizeError handles it.
    // At minimum, it shouldn't crash.
  });
});
