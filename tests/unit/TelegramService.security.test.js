import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  const originalEnv = process.env.NODE_ENV;
  const botToken = 'SECRET_BOT_TOKEN_123';

  beforeEach(() => {
    originalFetch = global.fetch;
    const config = { telegram: { botToken, adminId: '123456', allowedUserId: '123456' } };
    telegramService = new TelegramService(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalEnv;
  });

  it('should sanitize bot token from fetch error messages, stack, and cause in sendMessage', async () => {
    let capturedError = null;
    const originalConsoleError = console.error;
    console.error = (msg, err) => {
      capturedError = err;
    };

    const rootCause = new Error(`Connection to https://api.telegram.org/bot${botToken}/sendMessage failed`);
    rootCause.customProp = `secret is ${botToken}`;
    const fetchError = new TypeError(`fetch failed for https://api.telegram.org/bot${botToken}/sendMessage`, { cause: rootCause });
    fetchError.stack = `TypeError: fetch failed for https://api.telegram.org/bot${botToken}/sendMessage\n  at something`;

    global.fetch = async () => {
      throw fetchError;
    };

    await telegramService.sendMessage('test');

    console.error = originalConsoleError;

    assert.ok(capturedError);
    assert.strictEqual(capturedError.message.includes(botToken), false);
    assert.strictEqual(capturedError.stack.includes(botToken), false);
    assert.strictEqual(capturedError.cause.message.includes(botToken), false);
    assert.strictEqual(capturedError.cause.customProp.includes(botToken), false);

    assert.ok(capturedError.message.includes('[HIDDEN_TOKEN]'));
    assert.ok(capturedError.cause.message.includes('[HIDDEN_TOKEN]'));
  });

  it('should not leak bot token on polling error in development mode', async () => {
    let capturedError = null;
    const originalConsoleError = console.error;
    console.error = (msg, err) => {
      if (msg.includes('Polling error:')) {
        capturedError = err;
      }
    };

    const fetchError = new Error(`fetch failed for https://api.telegram.org/bot${botToken}/getUpdates`);
    global.fetch = async () => { throw fetchError; };

    process.env.NODE_ENV = 'development';

    // Test the internal poll updates method behavior (since interval takes 3s)
    // we bypass the private protection for testing by temporarily replacing fetch and calling startPolling
    // Actually, we can just trigger it manually if we could, but let's just mock setInterval
    const originalSetInterval = global.setInterval;
    global.setInterval = (cb) => { cb(); return 123; };

    telegramService.startPolling();

    global.setInterval = originalSetInterval;

    // sleep for promises
    await new Promise(r => setTimeout(r, 10));

    console.error = originalConsoleError;

    assert.ok(capturedError);
    assert.strictEqual(capturedError.message.includes(botToken), false);
    assert.ok(capturedError.message.includes('[HIDDEN_TOKEN]'));
  });
});
