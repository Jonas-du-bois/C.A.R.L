import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { AIService } from '../../src/services/AIService.js';

describe('AIService Security Tests', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should sanitize native fetch errors to prevent API key leakage in nested cause', async () => {
    const fakeApiKey = 'secret-api-key-12345';
    const config = {
      ai: {
        provider: 'gemini',
        apiKey: fakeApiKey
      }
    };
    const aiService = new AIService(config);

    // Mock fetch to simulate a native network error (like DNS failure or connection refused)
    global.fetch = async (url) => {
      const error = new TypeError('fetch failed');
      // The native node:fetch nests the url (with the API key) inside the cause
      error.cause = new Error(`getaddrinfo ENOTFOUND generativelanguage.googleapis.com:generateContent?key=${fakeApiKey}`);
      throw error;
    };

    try {
      await aiService.analyzeMessage({ body: 'test message' });
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual(error.name, 'TypeError', 'Should preserve the original error name');

      // The API key should not be in the main message
      assert.ok(!error.message.includes(fakeApiKey), 'Error message should not leak API key');

      // The cause should exist and be sanitized
      assert.ok(error.cause, 'Error should have a cause');
      assert.ok(!error.cause.message.includes(fakeApiKey), 'Nested cause message should not leak API key');

      // The API key should be replaced by [HIDDEN_TOKEN]
      assert.ok(error.cause.message.includes('[HIDDEN_TOKEN]'), 'API key should be replaced with placeholder');
    }
  });

  it('should sanitize API key in error stack', async () => {
    const fakeApiKey = 'secret-api-key-12345';
    const config = {
      ai: {
        provider: 'openai',
        apiKey: fakeApiKey
      }
    };
    const aiService = new AIService(config);

    global.fetch = async (url, options) => {
      const error = new Error(`Failed to fetch ${url} with auth Bearer ${fakeApiKey}`);
      error.stack = `Error: Failed to fetch ${url} with auth Bearer ${fakeApiKey}\n    at fetch (/app/src/services/AIService.js:100:1)`;
      throw error;
    };

    try {
      await aiService.analyzeMessage({ body: 'test message' });
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(!error.message.includes(fakeApiKey), 'Error message should not leak API key');
      assert.ok(error.message.includes('[HIDDEN_TOKEN]'), 'Message should contain placeholder');
      assert.ok(!error.stack.includes(fakeApiKey), 'Error stack should not leak API key');
      assert.ok(error.stack.includes('[HIDDEN_TOKEN]'), 'Stack should contain placeholder');
    }
  });
});
