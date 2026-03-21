import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let originalFetch;
  let originalConsoleError;
  let loggedErrors = [];

  before(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    console.error = (...args) => {
      loggedErrors.push(args);
    };
  });

  after(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should sanitize bot token from fetch error logs', async () => {
    const fakeToken = 'secret-token-12345';
    const fakeUrl = `https://api.telegram.org/bot${fakeToken}/sendMessage`;

    // Simulate fetch throwing an error containing the URL (and thus the token)
    global.fetch = async () => {
      throw new Error(`Failed to fetch ${fakeUrl}`);
    };

    const service = new TelegramService({
      telegram: {
        botToken: fakeToken,
        adminId: 'admin',
        allowedUserId: 'admin'
      }
    });

    loggedErrors = [];
    await service.sendMessage('test message');

    // Verification
    assert.strictEqual(loggedErrors.length, 1, 'Expected one error to be logged');
    const loggedError = loggedErrors[0][1];

    assert.ok(loggedError instanceof Error, 'Expected logged error to be an instance of Error');
    assert.match(loggedError.message, /\[HIDDEN_TOKEN\]/, 'Token should be replaced with [HIDDEN_TOKEN]');
    assert.doesNotMatch(loggedError.message, new RegExp(fakeToken), 'Real token should not be present in error message');
  });

  it('should sanitize bot token from string error logs', async () => {
    const fakeToken = 'secret-token-12345';

    // Simulate fetch returning an error string containing the token
    global.fetch = async () => ({
      ok: false,
      text: async () => `Bad request: token ${fakeToken} is invalid`
    });

    const service = new TelegramService({
      telegram: {
        botToken: fakeToken,
        adminId: 'admin',
        allowedUserId: 'admin'
      }
    });

    loggedErrors = [];
    await service.sendMessage('test message');

    // Verification
    assert.strictEqual(loggedErrors.length, 1, 'Expected one error to be logged');
    const loggedErrorString = loggedErrors[0][1];

    assert.strictEqual(typeof loggedErrorString, 'string', 'Expected logged error to be a string');
    assert.match(loggedErrorString, /\[HIDDEN_TOKEN\]/, 'Token should be replaced with [HIDDEN_TOKEN]');
    assert.doesNotMatch(loggedErrorString, new RegExp(fakeToken), 'Real token should not be present in error string');
  });
});
