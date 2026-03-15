import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../../src/services/TelegramService.js';

describe('TelegramService Security Tests', () => {
  let service;
  const originalConsoleError = console.error;
  let loggedErrors = [];

  beforeEach(() => {
    service = new TelegramService({
      telegram: {
        botToken: 'secret_token_123!@#',
        adminId: '123456789'
      }
    });

    // Mock console.error
    loggedErrors = [];
    console.error = (...args) => {
      loggedErrors.push(args);
    };

    // Mock fetch to simulate failures
    global.fetch = async () => {
      throw new Error('fetch failed with https://api.telegram.org/botsecret_token_123!@#/sendMessage');
    };
  });

  afterEach(() => {
    console.error = originalConsoleError;
    delete global.fetch;
  });

  it('should sanitize botToken from string error logs', async () => {
    global.fetch = async () => ({
      ok: false,
      text: async () => 'API Error with secret_token_123!@# token'
    });

    await service.sendMessage('test message');

    assert.strictEqual(loggedErrors.length, 1);
    const logArg = loggedErrors[0][1];

    assert.ok(typeof logArg === 'string', 'Expected string log arg');
    assert.ok(!logArg.includes('secret_token_123!@#'), 'Token leaked in string log');
    assert.ok(logArg.includes('[HIDDEN_TOKEN]'), 'Token not replaced with placeholder');
  });

  it('should sanitize botToken from Error object message', async () => {
    await service.sendMessage('test message');

    assert.strictEqual(loggedErrors.length, 1);
    const logArg = loggedErrors[0][1];

    assert.ok(logArg instanceof Error, 'Expected Error object');
    assert.ok(!logArg.message.includes('secret_token_123!@#'), 'Token leaked in Error message');
    assert.ok(logArg.message.includes('[HIDDEN_TOKEN]'), 'Token not replaced in Error message');
  });

  it('should sanitize botToken from Error object stack', async () => {
    await service.sendMessage('test message');

    assert.strictEqual(loggedErrors.length, 1);
    const logArg = loggedErrors[0][1];

    assert.ok(logArg instanceof Error, 'Expected Error object');
    if (logArg.stack) {
      assert.ok(!logArg.stack.includes('secret_token_123!@#'), 'Token leaked in Error stack');
      assert.ok(logArg.stack.includes('[HIDDEN_TOKEN]'), 'Token not replaced in Error stack');
    }
  });

  it('should sanitize botToken from nested Error causes', async () => {
    global.fetch = async () => {
      const cause = new Error('nested error with secret_token_123!@#');
      const err = new Error('main error');
      err.cause = cause;
      throw err;
    };

    await service.sendMessage('test message');

    assert.strictEqual(loggedErrors.length, 1);
    const logArg = loggedErrors[0][1];

    assert.ok(logArg instanceof Error, 'Expected Error object');
    assert.ok(logArg.cause instanceof Error, 'Expected nested Error object in cause');
    assert.ok(!logArg.cause.message.includes('secret_token_123!@#'), 'Token leaked in nested Error message');
    assert.ok(logArg.cause.message.includes('[HIDDEN_TOKEN]'), 'Token not replaced in nested Error message');
  });
});
