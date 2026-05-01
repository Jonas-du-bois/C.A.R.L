import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
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

  it('should not leak botToken in fetch error logs', async () => {
    const token = '12345:ABC-def';
    const service = new TelegramService({ telegram: { botToken: token, adminId: '123' } });

    let errorLogged = null;
    console.error = (msg, err) => {
      errorLogged = err;
    };

    global.fetch = async () => {
      const rootErr = new Error(`Failed to fetch https://api.telegram.org/bot${token}/sendMessage`);
      throw new TypeError('Network Error', { cause: rootErr });
    };

    await service.sendMessage('test');

    assert.ok(errorLogged);
    assert.strictEqual(errorLogged.message.includes(token), false);
    assert.strictEqual(errorLogged.cause.message.includes(token), false);
    assert.strictEqual(errorLogged.cause.message.includes('[HIDDEN_TOKEN]'), true);
  });
});
