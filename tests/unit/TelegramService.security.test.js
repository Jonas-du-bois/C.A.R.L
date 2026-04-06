import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security Tests', () => {
  const mockConfig = {
    telegram: {
      botToken: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      adminId: '987654321',
      allowedUserId: '987654321'
    }
  };

  let service;
  let originalFetch;
  let originalConsoleError;
  let consoleErrorCalls = [];

  beforeEach(() => {
    service = new TelegramService(mockConfig);

    // Mock fetch
    originalFetch = global.fetch;

    // Mock console.error
    originalConsoleError = console.error;
    consoleErrorCalls = [];
    console.error = (...args) => {
      consoleErrorCalls.push(args);
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should sanitize the bot token in fetch throw errors', async () => {
    const fakeErrorMsg = `Network error calling https://api.telegram.org/bot${mockConfig.telegram.botToken}/sendMessage`;
    const errorWithSecret = new Error(fakeErrorMsg);

    // Mock fetch to throw an error containing the secret
    global.fetch = async () => {
      throw errorWithSecret;
    };

    // Trigger an action that catches and logs
    await service.sendMessage('Test message');

    assert.strictEqual(consoleErrorCalls.length, 1);

    const loggedError = consoleErrorCalls[0][1];

    // Original error should be preserved somewhat
    assert.ok(loggedError instanceof Error);
    assert.strictEqual(loggedError.name, 'Error');

    // But the token should be hidden
    assert.ok(!loggedError.message.includes(mockConfig.telegram.botToken));
    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'));

    if (loggedError.stack) {
      assert.ok(!loggedError.stack.includes(mockConfig.telegram.botToken));
      assert.ok(loggedError.stack.includes('[HIDDEN_TOKEN]'));
    }
  });

  it('should sanitize the bot token in fetch non-ok response text', async () => {
    const errorTextWithSecret = `API Error with token ${mockConfig.telegram.botToken}`;

    // Mock fetch to return non-ok response with text
    global.fetch = async () => {
      return {
        ok: false,
        text: async () => errorTextWithSecret
      };
    };

    // Trigger an action that catches and logs text
    await service.sendMessage('Test message');

    assert.strictEqual(consoleErrorCalls.length, 1);

    const loggedText = consoleErrorCalls[0][1];

    // Text should be sanitized
    assert.strictEqual(typeof loggedText, 'string');
    assert.ok(!loggedText.includes(mockConfig.telegram.botToken));
    assert.ok(loggedText.includes('[HIDDEN_TOKEN]'));
  });

  it('should handle nested errors (cause) correctly', async () => {
    // This is technically testing the private method via a public method
    // We'll simulate a fetch error with a cause
    const innerError = new Error(`Inner error: ${mockConfig.telegram.botToken}`);
    const outerError = new Error(`Outer error: ${mockConfig.telegram.botToken}`);
    outerError.cause = innerError;

    global.fetch = async () => {
      throw outerError;
    };

    await service.sendMessage('Test message');

    assert.strictEqual(consoleErrorCalls.length, 1);
    const loggedError = consoleErrorCalls[0][1];

    assert.ok(loggedError instanceof Error);
    assert.ok(!loggedError.message.includes(mockConfig.telegram.botToken));

    assert.ok(loggedError.cause instanceof Error);
    assert.ok(!loggedError.cause.message.includes(mockConfig.telegram.botToken));
    assert.ok(loggedError.cause.message.includes('[HIDDEN_TOKEN]'));
  });
});
