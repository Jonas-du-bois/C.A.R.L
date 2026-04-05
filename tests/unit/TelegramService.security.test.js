import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security Tests', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;

  const config = {
    telegram: {
      botToken: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
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
  });

  it('should not leak bot token in error logs when fetch throws an error', async () => {
    let loggedError = null;

    // Spy on console.error
    console.error = (msg, err) => {
      loggedError = err;
    };

    // Mock fetch to throw an error containing the URL (and thus the bot token)
    global.fetch = async (url) => {
      throw new Error(`Failed to fetch: ${url}`);
    };

    // Trigger an action that makes a fetch call
    await telegramService.sendMessage('Test message');

    assert.ok(loggedError instanceof Error, 'Expected console.error to receive an Error object');
    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'), 'Expected error message to contain [HIDDEN_TOKEN]');
    assert.ok(!loggedError.message.includes(config.telegram.botToken), 'Expected error message NOT to contain the actual bot token');

    // Check stack trace as well, as some environments embed the message in the stack
    if (loggedError.stack) {
      assert.ok(loggedError.stack.includes('[HIDDEN_TOKEN]'), 'Expected error stack to contain [HIDDEN_TOKEN]');
      assert.ok(!loggedError.stack.includes(config.telegram.botToken), 'Expected error stack NOT to contain the actual bot token');
    }
  });

  it('should not leak bot token when API returns an error message as string', async () => {
    let loggedErrorStr = null;

    // Spy on console.error
    console.error = (msg, err) => {
      loggedErrorStr = err;
    };

    // Mock fetch to return a non-ok response with text containing the bot token
    global.fetch = async (url) => ({
      ok: false,
      text: async () => `API Error for token ${config.telegram.botToken}`
    });

    // Trigger an action that makes a fetch call
    await telegramService.sendMessage('Test message');

    assert.strictEqual(typeof loggedErrorStr, 'string', 'Expected console.error to receive a string');
    assert.ok(loggedErrorStr.includes('[HIDDEN_TOKEN]'), 'Expected string to contain [HIDDEN_TOKEN]');
    assert.ok(!loggedErrorStr.includes(config.telegram.botToken), 'Expected string NOT to contain the actual bot token');
  });
});
