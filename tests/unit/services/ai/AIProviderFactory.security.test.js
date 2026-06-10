import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createProvider } from '../../../../src/services/ai/AIProviderFactory.js';

describe('AIProviderFactory - Security', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should sanitize API keys in fetch network error messages', async () => {
    const config = {
      apiKey: 'secret-gemini-key-123.+$^[]',
      model: 'gemini-1.5-flash'
    };
    const provider = createProvider('gemini', config);

    global.fetch = async () => {
      throw new Error(`fetch failed to https://api.example.com/?key=${config.apiKey}`);
    };

    await assert.rejects(
      async () => await provider.call('Hello'),
      (err) => {
        assert.strictEqual(err.message.includes(config.apiKey), false, 'API key should not be in message');
        assert.strictEqual(err.message.includes('[HIDDEN_TOKEN]'), true, 'API key should be replaced with token');
        return true;
      }
    );
  });

  it('should sanitize API keys in nested cause errors', async () => {
    const config = {
      apiKey: 'secret-openai-key-456.+$^[]'
    };
    const provider = createProvider('openai', config);

    global.fetch = async () => {
      const rootError = new Error(`Connection refused to proxy for key ${config.apiKey}`);
      throw new Error(`fetch failed`, { cause: rootError });
    };

    await assert.rejects(
      async () => await provider.call('Hello'),
      (err) => {
        // Main error message
        assert.strictEqual(err.message.includes(config.apiKey), false, 'API key should not be in outer message');

        // Nested cause error message
        assert.ok(err.cause, 'Error should have a cause');
        assert.strictEqual(err.cause.message.includes(config.apiKey), false, 'API key should not be in inner message');
        assert.strictEqual(err.cause.message.includes('[HIDDEN_TOKEN]'), true, 'API key should be replaced with token in inner message');

        return true;
      }
    );
  });
});
