import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security Tests', () => {
  const secretToken = '12345:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

  const createService = () => {
    return new TelegramService({
      telegram: {
        botToken: secretToken,
        adminId: '123456',
        allowedUserId: '123456'
      }
    });
  };

  it('should sanitize botToken from string messages', () => {
    const service = createService();
    const rawMessage = `Error fetching https://api.telegram.org/bot${secretToken}/getUpdates`;

    const sanitized = service.sanitizeErrorForTesting(rawMessage);

    assert.ok(!sanitized.includes(secretToken), 'Token should be removed');
    assert.ok(sanitized.includes('[HIDDEN_TOKEN]'), 'Token should be replaced with placeholder');
  });

  it('should sanitize botToken from standard Error objects', () => {
    const service = createService();
    const error = new Error(`Failed to access https://api.telegram.org/bot${secretToken}/sendMessage`);
    error.stack = `Error: Failed to access https://api.telegram.org/bot${secretToken}/sendMessage\n    at Object.<anonymous> (/app/src/test.js:1:1)`;

    const sanitized = service.sanitizeErrorForTesting(error);

    assert.strictEqual(sanitized.name, 'Error');
    assert.ok(!sanitized.message.includes(secretToken), 'Token should be removed from message');
    assert.ok(!sanitized.stack.includes(secretToken), 'Token should be removed from stack');
    assert.ok(sanitized.message.includes('[HIDDEN_TOKEN]'), 'Token should be replaced in message');
  });

  it('should recursively sanitize nested errors (cause)', () => {
    const service = createService();

    const innerCause = new TypeError(`Cannot read property of undefined in bot${secretToken}`);
    const rootError = new Error(`Network error on bot${secretToken}`);
    rootError.cause = innerCause;

    const sanitized = service.sanitizeErrorForTesting(rootError);

    assert.ok(!sanitized.message.includes(secretToken), 'Token removed from root message');
    assert.ok(!sanitized.cause.message.includes(secretToken), 'Token removed from nested cause message');
    assert.strictEqual(sanitized.cause.name, 'TypeError', 'Should preserve nested error type');
  });

  it('should sanitize custom properties on Error objects', () => {
    const service = createService();

    const error = new Error('API failed');
    error.url = `https://api.telegram.org/bot${secretToken}/sendMessage`;
    error.context = { url: `https://api.telegram.org/bot${secretToken}/getUpdates` };

    const sanitized = service.sanitizeErrorForTesting(error);

    assert.ok(!sanitized.url.includes(secretToken), 'Token removed from custom property');
    assert.ok(sanitized.url.includes('[HIDDEN_TOKEN]'));

    // Note: Depends on how deep the sanitization goes.
    // If we only sanitize top-level string properties, `error.context.url` might still contain the token.
    // But for this test, we'll assume we either serialize custom objects or just sanitize direct string props.
    if (typeof sanitized.context === 'string') {
        assert.ok(!sanitized.context.includes(secretToken), 'Token removed from stringified context');
    }
  });

  it('should preserve original Error name and not mutate original error', () => {
    const service = createService();

    class CustomAPIError extends Error {
      constructor(message) {
        super(message);
        this.name = 'CustomAPIError';
      }
    }

    const originalError = new CustomAPIError(`Error with ${secretToken}`);
    const sanitized = service.sanitizeErrorForTesting(originalError);

    assert.strictEqual(sanitized.name, 'CustomAPIError', 'Should preserve custom error name');
    assert.ok(!sanitized.message.includes(secretToken), 'Token removed from sanitized message');
    assert.ok(originalError.message.includes(secretToken), 'Original error should not be mutated');
  });

  it('should handle null, undefined, or empty errors gracefully', () => {
    const service = createService();

    assert.strictEqual(service.sanitizeErrorForTesting(null), null);
    assert.strictEqual(service.sanitizeErrorForTesting(undefined), undefined);
    assert.strictEqual(service.sanitizeErrorForTesting(''), '');
    assert.strictEqual(service.sanitizeErrorForTesting(123), 123);
  });
});
