import { describe, it, beforeEach, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security Tests', () => {
  let originalFetch;
  let originalConsoleError;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    mock.reset();
  });

  it('should not leak botToken when fetch fails with an error', async () => {
    const secretToken = 'SECRET_BOT_TOKEN_123';
    const config = {
      telegram: {
        botToken: secretToken,
        adminId: '123456'
      }
    };

    const telegramService = new TelegramService(config);

    global.fetch = async () => {
      const err = new Error(`Network error on https://api.telegram.org/bot${secretToken}/sendMessage`);
      throw err;
    };

    let loggedErrorArgs = [];
    console.error = mock.fn((...args) => {
      loggedErrorArgs.push(args);
    });

    await telegramService.sendMessage('Test message');

    assert.strictEqual(loggedErrorArgs.length > 0, true, 'console.error was not called');

    const loggedErrorString = JSON.stringify(loggedErrorArgs, Object.getOwnPropertyNames(loggedErrorArgs[0][1]));

    // We test standard JSON.stringify too in case getOwnPropertyNames drops something
    const stringified = JSON.stringify(loggedErrorArgs) + " " + loggedErrorString + " " + loggedErrorArgs[0][1].message + " " + loggedErrorArgs[0][1].stack;

    assert.strictEqual(
      stringified.includes(secretToken),
      false,
      'Bot token leaked in console.error!'
    );
    assert.strictEqual(
      stringified.includes('[HIDDEN_TOKEN]'),
      true,
      'Bot token was not replaced with [HIDDEN_TOKEN]'
    );
  });

  it('should not leak botToken when API returns non-ok response', async () => {
    const secretToken = 'SECRET_BOT_TOKEN_123';
    const config = {
      telegram: {
        botToken: secretToken,
        adminId: '123456'
      }
    };

    const telegramService = new TelegramService(config);

    global.fetch = async () => ({
      ok: false,
      text: async () => `Unauthorized access for bot ${secretToken}`
    });

    let loggedErrorArgs = [];
    console.error = mock.fn((...args) => {
      loggedErrorArgs.push(args);
    });

    await telegramService.sendMessage('Test message');

    assert.strictEqual(loggedErrorArgs.length > 0, true, 'console.error was not called');

    const loggedErrorString = JSON.stringify(loggedErrorArgs);
    assert.strictEqual(
      loggedErrorString.includes(secretToken),
      false,
      'Bot token leaked in console.error string!'
    );
    assert.strictEqual(
      loggedErrorString.includes('[HIDDEN_TOKEN]'),
      true,
      'Bot token was not replaced with [HIDDEN_TOKEN]'
    );
  });
});
