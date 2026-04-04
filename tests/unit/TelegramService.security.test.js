import test from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

test('TelegramService Security', async (t) => {
  await t.test('should sanitize bot token from fetch error messages', async () => {
    const secretToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    const telegramService = new TelegramService({
      telegram: {
        botToken: secretToken,
        adminId: '123456'
      }
    });

    const mockError = new Error(`fetch failed: https://api.telegram.org/bot${secretToken}/sendMessage`);
    mockError.cause = new Error(`inner cause with ${secretToken}`);
    mockError.stack = `Error: fetch failed: https://api.telegram.org/bot${secretToken}/sendMessage\n  at ...`;

    global.fetch = async () => {
      throw mockError;
    };

    let loggedError = null;
    const originalConsoleError = console.error;
    console.error = (msg, err) => {
      loggedError = err;
    };

    try {
      await telegramService.sendMessage('test message');
    } finally {
      console.error = originalConsoleError;
    }

    assert.ok(loggedError instanceof Error);
    assert.strictEqual(loggedError.message.includes(secretToken), false);
    assert.strictEqual(loggedError.message.includes('[HIDDEN_TOKEN]'), true);
    assert.strictEqual(loggedError.stack.includes(secretToken), false);
    assert.strictEqual(loggedError.stack.includes('[HIDDEN_TOKEN]'), true);
    assert.strictEqual(loggedError.cause.message.includes(secretToken), false);
    assert.strictEqual(loggedError.cause.message.includes('[HIDDEN_TOKEN]'), true);
  });
});
