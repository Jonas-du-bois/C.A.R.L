import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let originalFetch;
  let originalConsoleError;
  let consoleErrorOutput = [];

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    consoleErrorOutput = [];
    console.error = (...args) => {
      consoleErrorOutput.push(args);
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  test('should sanitize bot token from fetch errors in sendMessage', async () => {
    const secretToken = 'SECRET_TOKEN_12345';
    const service = new TelegramService({ telegram: { botToken: secretToken, adminId: '123' } });

    const rootError = new Error(`Connection failed to api.telegram.org/bot${secretToken}`);
    const fetchError = new Error(`fetch failed for api.telegram.org/bot${secretToken}`, { cause: rootError });

    global.fetch = async () => { throw fetchError; };

    await service.sendMessage('test message');

    assert.strictEqual(consoleErrorOutput.length, 1);
    const loggedError = consoleErrorOutput[0][1];

    assert.ok(loggedError instanceof Error);
    assert.ok(!loggedError.message.includes(secretToken), 'Message should not contain token');
    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'));

    assert.ok(!loggedError.cause.message.includes(secretToken), 'Cause message should not contain token');
    assert.ok(loggedError.cause.message.includes('[HIDDEN_TOKEN]'));

    if (loggedError.stack) {
      assert.ok(!loggedError.stack.includes(secretToken), 'Stack should not contain token');
    }
  });

  test('should sanitize bot token from fetch errors in sendQRCode', async () => {
    const secretToken = 'SECRET_TOKEN_12345';
    const service = new TelegramService({ telegram: { botToken: secretToken, adminId: '123' } });

    const rootError = new Error(`Connection failed to api.telegram.org/bot${secretToken}`);
    const fetchError = new Error(`fetch failed for api.telegram.org/bot${secretToken}`, { cause: rootError });

    global.fetch = async () => { throw fetchError; };

    await service.sendQRCode('dummy qr data');

    assert.strictEqual(consoleErrorOutput.length, 1);
    const loggedError = consoleErrorOutput[0][1];

    assert.ok(loggedError instanceof Error);
    assert.ok(!loggedError.message.includes(secretToken), 'Message should not contain token');
    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'));

    assert.ok(!loggedError.cause.message.includes(secretToken), 'Cause message should not contain token');
    assert.ok(loggedError.cause.message.includes('[HIDDEN_TOKEN]'));
  });
});
