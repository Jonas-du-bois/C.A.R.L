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
});
