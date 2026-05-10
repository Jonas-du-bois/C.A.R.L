import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should not leak botToken in sendMessage errors', async () => {
    const secretToken = 'SECRET_TOKEN_123';
    telegramService = new TelegramService({ telegram: { botToken: secretToken, adminId: '1' } });

    const fakeError = new Error(`Failed to fetch URL with ${secretToken}`);
    fakeError.cause = new Error(`Inner error with ${secretToken}`);
    global.fetch = () => Promise.reject(fakeError);

    let loggedError = null;
    console.error = (msg, err) => { loggedError = err; };

    await telegramService.sendMessage('test');

    assert.ok(loggedError);
    assert.ok(!loggedError.message.includes(secretToken));
    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'));

    assert.ok(loggedError.cause);
    assert.ok(!loggedError.cause.message.includes(secretToken));
    assert.ok(loggedError.cause.message.includes('[HIDDEN_TOKEN]'));
  });
});
