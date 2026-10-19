import test from 'node:test';
import assert from 'node:assert';
import { safeFetch } from '../../src/utils/Sanitizer.js';

test('safeFetch', async (t) => {
  await t.test('should redact secret from error message and stack', async () => {
    const originalFetch = global.fetch;
    const secret = 'MY_SUPER_SECRET_KEY';

    global.fetch = async () => {
      throw new Error(`Failed to fetch from url with key ${secret}`);
    };

    try {
      await safeFetch('http://example.com', {}, secret);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(!err.message.includes(secret));
      assert.ok(err.message.includes('***REDACTED***'));
      if (err.stack) {
        assert.ok(!err.stack.includes(secret));
        assert.ok(err.stack.includes('***REDACTED***'));
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('should redact secrets from Authorization header', async () => {
    const originalFetch = global.fetch;
    const bearerToken = 'BEARER_TOKEN_123';

    global.fetch = async () => {
      throw new Error(`Failed with token ${bearerToken}`);
    };

    try {
      await safeFetch('http://example.com', { headers: { Authorization: `Bearer ${bearerToken}` } });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(!err.message.includes(bearerToken));
      assert.ok(err.message.includes('***REDACTED***'));
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('should handle native fetch timeout DOMException', async () => {
    const originalFetch = global.fetch;
    const secret = 'MY_SUPER_SECRET_KEY';

    global.fetch = async () => {
      const err = new DOMException(`Timeout error ${secret}`, 'TimeoutError');
      throw err;
    };

    try {
      await safeFetch('http://example.com', {}, secret);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(!err.message.includes(secret));
      assert.ok(err.message.includes('***REDACTED***'));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
