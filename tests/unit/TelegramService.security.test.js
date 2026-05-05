import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let telegramService;
  let originalFetch;
  let originalConsoleError;
  let consoleErrorOutput;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    consoleErrorOutput = [];
    console.error = (...args) => {
      consoleErrorOutput.push(args);
    };

    telegramService = new TelegramService({
      telegram: {
        botToken: 'secret-token-123.abc+def',
        adminId: '123456'
      }
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should sanitize bot token from string errors', async () => {
    global.fetch = async () => ({
      ok: false,
      text: async () => 'Error with url https://api.telegram.org/botsecret-token-123.abc+def/sendMessage'
    });

    await telegramService.sendMessage('Test');

    assert.strictEqual(consoleErrorOutput.length, 1);
    assert.strictEqual(consoleErrorOutput[0][1].includes('secret-token-123.abc+def'), false);
    assert.strictEqual(consoleErrorOutput[0][1].includes('[HIDDEN_TOKEN]'), true);
  });

  it('should sanitize bot token from Error objects with nested causes', async () => {
    const rootError = new Error('Root cause: secret-token-123.abc+def');
    rootError.customProp = 'custom-secret-token-123.abc+def';

    global.fetch = async () => {
      throw new Error('Fetch failed for https://api.telegram.org/botsecret-token-123.abc+def/sendMessage', { cause: rootError });
    };

    await telegramService.sendMessage('Test');

    assert.strictEqual(consoleErrorOutput.length, 1);
    const sanitizedError = consoleErrorOutput[0][1];

    assert.strictEqual(sanitizedError instanceof Error, true);
    assert.strictEqual(sanitizedError.message.includes('secret-token-123.abc+def'), false);
    assert.strictEqual(sanitizedError.message.includes('[HIDDEN_TOKEN]'), true);

    assert.strictEqual(sanitizedError.cause instanceof Error, true);
    assert.strictEqual(sanitizedError.cause.message.includes('secret-token-123.abc+def'), false);
    assert.strictEqual(sanitizedError.cause.message.includes('[HIDDEN_TOKEN]'), true);

    assert.strictEqual(sanitizedError.cause.customProp.includes('secret-token-123.abc+def'), false);
    assert.strictEqual(sanitizedError.cause.customProp.includes('[HIDDEN_TOKEN]'), true);
  });
});
