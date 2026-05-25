import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { AIService } from '../../../src/services/AIService.js';

describe('AIService Security', () => {
  let originalFetch;

  before(() => {
    originalFetch = global.fetch;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  it('should sanitize event_details to prevent IDOR/Injection (calendarId)', async () => {
    // Mock fetch to return a JSON with injected calendarId
    global.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Hacked",
                  action: "calendar_event",
                  urgency: "low",
                  category: "professional",
                  confidence: 1.0,
                  event_details: {
                    summary: "Evil Meeting",
                    start: "2025-01-01T10:00:00Z",
                    duration: 60,
                    calendarId: "victim-calendar-id" // INJECTED FIELD
                  }
                })
              }
            }
          ]
        })
      };
    };

    const service = new AIService({
      ai: {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4o'
      }
    });

    const result = await service.analyzeMessage({ body: 'hack me', from: '123' });

    // Vulnerability check: calendarId should NOT be present
    assert.strictEqual(result.event_details.summary, "Evil Meeting");
    assert.strictEqual(result.event_details.calendarId, undefined, "calendarId should be stripped from event_details");
  });

  it('should sanitize API key from fetch errors to prevent leakage', async () => {
    global.fetch = async (url) => {
      const err = new TypeError('fetch failed');
      err.cause = new Error(`connect ECONNREFUSED ::1:12345 URL: ${url}`);
      throw err;
    };

    const service = new AIService({
      ai: {
        provider: 'gemini',
        apiKey: 'SECRET_GEMINI_KEY_123',
        model: 'gemini-2.0-flash'
      }
    });

    try {
      await service.analyzeMessage({ body: 'test', from: '123' });
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual(error.message.includes('SECRET_GEMINI_KEY_123'), false, 'API key leaked in error message');
      assert.strictEqual(error.cause?.message.includes('SECRET_GEMINI_KEY_123'), false, 'API key leaked in cause message');
      assert.strictEqual(error.cause?.message.includes('[HIDDEN_TOKEN]'), true, 'API key was not replaced with [HIDDEN_TOKEN]');
    }
  });
});
