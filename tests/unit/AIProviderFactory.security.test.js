import { test, describe, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createProvider } from '../../src/services/ai/AIProviderFactory.js';

describe('AIProviderFactory Security', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('sanitizes API keys in network errors from GeminiProvider', async () => {
    const API_KEY = 'secret_gemini_key_123!';
    const provider = createProvider('gemini', { apiKey: API_KEY });

    // Mock fetch to throw a network error containing the key
    global.fetch = async () => {
      const rootError = new Error(`failed on url https://api.com?key=${API_KEY}`);
      const error = new Error(`fetch failed: ${API_KEY}`, { cause: rootError });
      error.url = `https://api.com?key=${API_KEY}`;
      throw error;
    };

    try {
      await provider.call('test prompt');
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(!error.message.includes(API_KEY), 'Error message contains API key');
      assert.ok(error.message.includes('[HIDDEN_TOKEN]'), 'Error message missing hidden token');

      assert.ok(error.cause, 'Error should have a cause');
      assert.ok(!error.cause.message.includes(API_KEY), 'Cause message contains API key');
      assert.ok(error.cause.message.includes('[HIDDEN_TOKEN]'), 'Cause message missing hidden token');

      assert.ok(!error.url.includes(API_KEY), 'Custom property URL contains API key');
      assert.ok(error.url.includes('[HIDDEN_TOKEN]'), 'Custom property URL missing hidden token');
    }
  });

  test('sanitizes API keys in network errors from OpenAIProvider', async () => {
    const API_KEY = 'sk-secret_openai_key';
    const provider = createProvider('openai', { apiKey: API_KEY });

    global.fetch = async () => {
      throw new Error(`fetch failed: headers contain ${API_KEY}`);
    };

    try {
      await provider.call('test prompt');
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(!error.message.includes(API_KEY), 'Error message contains API key');
      assert.ok(error.message.includes('[HIDDEN_TOKEN]'), 'Error message missing hidden token');
    }
  });
});
