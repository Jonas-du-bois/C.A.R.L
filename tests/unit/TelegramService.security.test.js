import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let originalConsoleError;
  let errorLogs;

  beforeEach(() => {
    originalConsoleError = console.error;
    errorLogs = [];
    console.error = (...args) => {
      errorLogs.push(args);
    };
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should sanitize bot token from string error logs', async () => {
    const service = new TelegramService({ telegram: { botToken: 'secret-token-123', adminId: '123' } });

    // Mock fetch to simulate an API error returning a string with the token
    global.fetch = async () => ({
      ok: false,
      text: async () => 'Error accessing https://api.telegram.org/botsecret-token-123/getUpdates'
    });

    await service.sendMessage('test');

    assert.strictEqual(errorLogs.length, 1);
    assert.ok(errorLogs[0][1].includes('[HIDDEN_TOKEN]'));
    assert.ok(!errorLogs[0][1].includes('secret-token-123'));
  });

  it('should sanitize bot token from Error object logs', async () => {
    const service = new TelegramService({ telegram: { botToken: 'secret-token-123', adminId: '123' } });

    // Mock fetch to simulate a network error
    global.fetch = async () => {
      throw new Error('Network failure on https://api.telegram.org/botsecret-token-123/sendMessage');
    };

    await service.sendMessage('test');

    assert.strictEqual(errorLogs.length, 1);
    const loggedError = errorLogs[0][1];
    assert.ok(loggedError instanceof Error);
    assert.ok(loggedError.message.includes('[HIDDEN_TOKEN]'));
    assert.ok(!loggedError.message.includes('secret-token-123'));
  });
});
