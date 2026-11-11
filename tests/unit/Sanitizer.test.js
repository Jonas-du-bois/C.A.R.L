import { describe, it, beforeEach, afterEach } from 'node:test';
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
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should return successful response', async () => {
      global.fetch = async () => new Response('OK');
      const { safeFetch } = await import('../../src/utils/Sanitizer.js');
      const response = await safeFetch('https://example.com');
      assert.strictEqual(await response.text(), 'OK');
    });

    it('should sanitize regular Error messages and stack traces', async () => {
      global.fetch = async () => {
        const err = new Error('Failed to fetch from https://api.telegram.org/botMY_SECRET_TOKEN/getUpdates');
        err.stack = 'Error: Failed to fetch from https://api.telegram.org/botMY_SECRET_TOKEN/getUpdates\n    at Object.test';
        throw err;
      };

      const { safeFetch } = await import('../../src/utils/Sanitizer.js');

      try {
        await safeFetch('https://api.telegram.org/botMY_SECRET_TOKEN/getUpdates');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.strictEqual(err.message, 'Failed to fetch from https://api.telegram.org/bot***/getUpdates');
        assert.ok(err.stack.includes('bot***'));
        assert.ok(!err.stack.includes('MY_SECRET_TOKEN'));
      }
    });

    it('should sanitize DOMException read-only messages', async () => {
      global.fetch = async () => {
        // DOMException message is read-only
        const err = new DOMException('AbortError with https://api.com?key=SECRET_KEY');
        throw err;
      };

      const { safeFetch } = await import('../../src/utils/Sanitizer.js');

      try {
        await safeFetch('https://example.com');
        assert.fail('Should have thrown');
      } catch (err) {
        // The wrapper should have created a new Error object
        assert.strictEqual(err.message, 'AbortError with https://api.com?key=***');
        assert.strictEqual(err.name, 'Error'); // Since it's a generic fallback Error
      }
    });
  });
});
