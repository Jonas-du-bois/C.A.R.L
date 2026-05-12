import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let originalFetch;
  let loggedErrors = [];
  let originalConsoleError;

  before(() => {
    originalFetch = global.fetch;
    originalConsoleError = console.error;
    console.error = (...args) => {
      loggedErrors.push(args.join(' '));
    };
  });

  after(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should not leak botToken when fetch fails in sendMessage', async () => {
    loggedErrors = [];
    const fakeToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

    global.fetch = async () => {
      throw new Error(`Fetch failed for https://api.telegram.org/bot${fakeToken}/sendMessage`);
    };

    const service = new TelegramService({
      telegram: { botToken: fakeToken, adminId: '123456789' }
    });

    await service.sendMessage('test message');

    assert.ok(loggedErrors.length > 0, 'Should log an error');
    assert.ok(!loggedErrors[0].includes(fakeToken), 'Bot token should not be leaked in console.error');
    assert.ok(loggedErrors[0].includes('[HIDDEN_TOKEN]'), 'Bot token should be replaced with [HIDDEN_TOKEN]');
  });
});
