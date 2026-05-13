import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createProvider } from '../../../src/services/ai/AIProviderFactory.js';

describe('AIProviderFactory Security', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('should sanitize API key from GeminiProvider fetch network errors', async () => {
    const secretKey = 'SUPER_SECRET_GEMINI_KEY_123';
    const provider = createProvider('gemini', { apiKey: secretKey });

    global.fetch = async () => {
      const cause = new Error(`getaddrinfo ENOTFOUND https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${secretKey}`);
      throw new TypeError('fetch failed', { cause });
    };

    try {
      await provider.call('test prompt');
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual(error.name, 'TypeError');
      assert.strictEqual(error.message, 'fetch failed');
      assert.ok(error.cause, 'Error should have a cause');
      assert.ok(!error.cause.message.includes(secretKey), 'Cause message should not contain the secret key');
      assert.ok(error.cause.message.includes('[HIDDEN_API_KEY]'), 'Cause message should contain the hidden key placeholder');
    }
  });

  test('should sanitize API key from OpenAIProvider fetch network errors', async () => {
    const secretKey = 'SUPER_SECRET_OPENAI_KEY_123';
    const provider = createProvider('openai', { apiKey: secretKey });

    global.fetch = async () => {
      const cause = new Error(`Connection refused to API with token ${secretKey}`);
      throw new TypeError('fetch failed', { cause });
    };

    try {
      await provider.call('test prompt');
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual(error.name, 'TypeError');
      assert.ok(error.cause, 'Error should have a cause');
      assert.ok(!error.cause.message.includes(secretKey), 'Cause message should not contain the secret key');
    }
  });
});
