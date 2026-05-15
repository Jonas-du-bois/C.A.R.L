import test from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

test('TelegramService Security Tests', async (t) => {
  await t.test('Sanitizes botToken in polling errors', async () => {
    // Override global fetch
    const originalFetch = global.fetch;
    const testToken = '12345:ABCDE-test-token-to-hide';

    try {
      global.fetch = async (url) => {
        throw new Error(`Failed to fetch from ${url}`);
      };

      const config = {
        telegram: {
          botToken: testToken,
          adminId: '123',
          allowedUserId: '123'
        }
      };

      const service = new TelegramService(config);

      let capturedError = null;
      let capturedMessage = null;
      const originalConsoleError = console.error;
      console.error = (msg, error) => {
        capturedMessage = msg;
        capturedError = error;
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Call answerCallback which uses fetch internally
      await service.answerCallback('query_123', 'text');

      process.env.NODE_ENV = originalEnv;
      console.error = originalConsoleError;

      assert.ok(capturedError !== null, 'Should capture an error');
      assert.ok(capturedError.message !== undefined, 'Error should have a message');

      const errorMessage = capturedError.message;
      const stack = capturedError.stack;

      assert.ok(!errorMessage.includes(testToken), 'Error message should not leak token');
      assert.ok(!stack.includes(testToken), 'Error stack should not leak token');
      assert.ok(errorMessage.includes('[HIDDEN_TOKEN]'), 'Error message should hide token');

    } finally {
      global.fetch = originalFetch;
    }
  });
});
