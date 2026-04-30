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

  it('should sanitize bot token from fetch error logs without mutating original error', async () => {
    const config = { telegram: { botToken: 'SECRET_TOKEN_123', adminId: '123456' } };
    telegramService = new TelegramService(config);

    const rootError = new Error('Connection refused to botSECRET_TOKEN_123');
    const fetchError = new TypeError('fetch failed to botSECRET_TOKEN_123', { cause: rootError });
    fetchError.customProp = 'botSECRET_TOKEN_123';

    global.fetch = async () => { throw fetchError; };

    let loggedError = null;
    console.error = (msg, err) => { loggedError = err; };

    await telegramService.sendMessage('Test');

    assert.ok(loggedError instanceof Error);
    assert.strictEqual(loggedError.name, 'TypeError');
    assert.ok(!loggedError.message.includes('SECRET_TOKEN_123'));
    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'));
    assert.strictEqual(loggedError.customProp, 'bot[HIDDEN_TOKEN]');

    assert.ok(loggedError.cause instanceof Error);
    assert.ok(!loggedError.cause.message.includes('SECRET_TOKEN_123'));
    assert.ok(loggedError.cause.message.includes('[HIDDEN_TOKEN]'));

    // Original object should not be mutated
    assert.ok(fetchError.message.includes('SECRET_TOKEN_123'));
    assert.strictEqual(fetchError.customProp, 'botSECRET_TOKEN_123');
    assert.ok(rootError.message.includes('SECRET_TOKEN_123'));
  });
});
