import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizePhoneNumber, sanitizeMessageContent, escapeHtml, safeFetch } from '../../src/utils/Sanitizer.js';

describe('Sanitizer', () => {
  describe('sanitizePhoneNumber', () => {
    it('should remove all non-digit characters except +', () => {
      const input = '+33 (0)6 12 34 56 78';
      // Note: The 0 is kept as it's a digit
      const expected = '+330612345678';
      assert.strictEqual(sanitizePhoneNumber(input), expected);
    });

    it('should handle numbers with dashes', () => {
      const input = '+1-234-567-8900';
      const expected = '+12345678900';
      assert.strictEqual(sanitizePhoneNumber(input), expected);
    });

    it('should preserve leading +', () => {
      const input = '+41791234567';
      assert.strictEqual(sanitizePhoneNumber(input), '+41791234567');
    });

    it('should handle numbers without country code', () => {
      const input = '06 12 34 56 78';
      const expected = '0612345678';
      assert.strictEqual(sanitizePhoneNumber(input), expected);
    });

    it('should handle empty string', () => {
      assert.strictEqual(sanitizePhoneNumber(''), '');
    });
  });

  describe('sanitizeMessageContent', () => {
    it('should remove zero-width characters', () => {
      const input = 'Hello\u200BWorld';
      const expected = 'HelloWorld';
      assert.strictEqual(sanitizeMessageContent(input), expected);
    });

    it('should remove zero-width joiner', () => {
      const input = 'Test\u200Cmessage';
      const expected = 'Testmessage';
      assert.strictEqual(sanitizeMessageContent(input), expected);
    });

    it('should remove zero-width non-joiner', () => {
      const input = 'Hello\u200D!';
      const expected = 'Hello!';
      assert.strictEqual(sanitizeMessageContent(input), expected);
    });

    it('should remove byte order mark', () => {
      const input = '\uFEFFHello';
      const expected = 'Hello';
      assert.strictEqual(sanitizeMessageContent(input), expected);
    });

    it('should truncate excessively long messages', () => {
      const input = 'A'.repeat(5000);
      const output = sanitizeMessageContent(input);
      assert.strictEqual(output.length, 4096);
    });

    it('should not truncate messages under 4096 characters', () => {
      const input = 'A'.repeat(1000);
      const output = sanitizeMessageContent(input);
      assert.strictEqual(output.length, 1000);
    });

    it('should handle empty string', () => {
      assert.strictEqual(sanitizeMessageContent(''), '');
    });

    it('should preserve normal characters', () => {
      const input = 'Hello World! 123 éàü';
      assert.strictEqual(sanitizeMessageContent(input), input);
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("xss")&\'</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&amp;&#039;&lt;/script&gt;';
      assert.strictEqual(escapeHtml(input), expected);
    });

    it('should return empty string for null/undefined', () => {
      assert.strictEqual(escapeHtml(null), '');
      assert.strictEqual(escapeHtml(undefined), '');
    });

    it('should handle numbers', () => {
      assert.strictEqual(escapeHtml(123), '123');
      assert.strictEqual(escapeHtml(0), '0');
    });

    it('should not change safe strings', () => {
      const input = 'Hello World';
      assert.strictEqual(escapeHtml(input), input);
    });
  });

  describe('safeFetch', () => {
    it('should successfully redact sensitive tokens from Error', async () => {
      const token = 'secret_token_123';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error(`fetch failed to https://api.com/bot${token}/test`);
      };

      try {
        await safeFetch(`https://api.com/bot${token}/test`, {}, [token]);
        assert.fail('Should have thrown an error');
      } catch (err) {
        assert.ok(!err.message.includes(token));
        assert.ok(err.message.includes('***REDACTED***'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should handle read-only DOMException without crashing', async () => {
      const token = 'another_secret_456';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        const err = new Error(`AbortError: Timeout for ${token}`);
        err.name = 'AbortError';
        // Simulate DOMException read-only message property
        Object.defineProperty(err, 'message', {
          value: `AbortError: Timeout for ${token}`,
          writable: false
        });
        throw err;
      };

      try {
        await safeFetch(`http://test.com/${token}`, {}, [token]);
        assert.fail('Should have thrown an error');
      } catch (err) {
        assert.strictEqual(err.name, 'AbortError');
        assert.ok(!err.message.includes(token));
        assert.ok(err.message.includes('***REDACTED***'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should not modify errors when no sensitive data is provided', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error('Normal connection error');
      };

      try {
        await safeFetch('http://test.com', {}, []);
        assert.fail('Should have thrown an error');
      } catch (err) {
        assert.strictEqual(err.message, 'Normal connection error');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
