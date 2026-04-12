import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let service;
  const botToken = '12345:ABCDefGHIJklmNOPQrstuvWXYZ';

  beforeEach(() => {
    service = new TelegramService({
      telegram: {
        botToken: botToken,
        adminId: '123456789'
      }
    });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('should not leak botToken in fetch errors during sendQRCode', async () => {
    // 1. Mock global fetch to throw an error containing the bot token
    const fetchError = new Error(`Failed to fetch https://api.telegram.org/bot${botToken}/sendPhoto`);
    fetchError.cause = new Error(`Connection reset while reaching bot${botToken}`);
    fetchError.stack = `Error: Failed to fetch https://api.telegram.org/bot${botToken}/sendPhoto\n    at functionCall (test.js:1:1)`;

    mock.method(global, 'fetch', async () => {
      throw fetchError;
    });

    // 2. Spy on console.error
    const consoleErrorMock = mock.method(console, 'error', () => {});

    // 3. Call the method that triggers the fetch
    await service.sendQRCode('dummy-data');

    // 4. Assert console.error was called
    assert.strictEqual(consoleErrorMock.mock.calls.length, 1);

    // 5. Assert the error passed to console.error does NOT contain the token
    const loggedError = consoleErrorMock.mock.calls[0].arguments[1];

    assert.ok(loggedError instanceof Error);
    assert.strictEqual(loggedError.message.includes(botToken), false, 'Logged error message should not contain bot token');
    assert.strictEqual(loggedError.message.includes('[HIDDEN_TOKEN]'), true, 'Logged error message should have token replaced');

    assert.strictEqual(loggedError.stack.includes(botToken), false, 'Logged error stack should not contain bot token');
    assert.strictEqual(loggedError.stack.includes('[HIDDEN_TOKEN]'), true, 'Logged error stack should have token replaced');

    assert.ok(loggedError.cause instanceof Error);
    assert.strictEqual(loggedError.cause.message.includes(botToken), false, 'Logged error cause should not contain bot token');
    assert.strictEqual(loggedError.cause.message.includes('[HIDDEN_TOKEN]'), true, 'Logged error cause should have token replaced');

    // 6. Verify original error was NOT mutated (important for error bubbling if needed later)
    assert.strictEqual(fetchError.message.includes(botToken), true, 'Original error message should not be mutated');
    assert.strictEqual(fetchError.stack.includes(botToken), true, 'Original error stack should not be mutated');
    assert.strictEqual(fetchError.cause.message.includes(botToken), true, 'Original error cause should not be mutated');
  });
});
