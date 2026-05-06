import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let service;
  let originalFetch;
  let originalConsoleError;
  const mockConfig = {
    telegram: {
      botToken: 'secret_token_123',
      adminId: '123456789'
    }
  };

  beforeEach(() => {
    service = new TelegramService(mockConfig);
    originalFetch = global.fetch;
    originalConsoleError = console.error;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it('should sanitize botToken from fetch errors in sendMessage', async () => {
    global.fetch = async () => {
      const rootError = new Error('Failed to connect to https://api.telegram.org/botsecret_token_123/getUpdates');
      const err = new Error('fetch failed', { cause: rootError });
      throw err;
    };

    let errorLog = '';
    console.error = (msg, err) => {
      errorLog += msg + ' ' + (err ? (err.message || err) : '') + (err?.cause ? err.cause.message : '');
    };

    await service.sendMessage('test');

    assert.strictEqual(errorLog.includes('secret_token_123'), false, 'The error log should not contain the secret token');
    assert.strictEqual(errorLog.includes('[HIDDEN_TOKEN]'), true, 'The token should be replaced by [HIDDEN_TOKEN]');
  });
});
