
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { AIService } from '../../../src/services/AIService.js';

describe('AIService Report Security', () => {
  let originalFetch;

  before(() => {
    originalFetch = global.fetch;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  it('should sanitize generateFullReport output to prevent massive payloads or injection', async () => {
    // Mock fetch to return a JSON with malicious/unexpected data
    global.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  salutation: "Hi",
                  resume_situation: "Situation",
                  // MASSIVE FIELD
                  conclusion: "A".repeat(100000),
                  // UNEXPECTED FIELD
                  malicious_script: "<script>alert(1)</script>",
                  taches: [
                    {
                      titre: "Task 1",
                      description: "Desc 1",
                      // UNEXPECTED FIELD IN TASK
                      hidden_payload: "rm -rf /"
                    }
                  ],
                  messages_actionnables: [
                    {
                      expediteur: "Alice",
                      message_original: "Hi",
                      // INVALID ENUM values
                      categorie: "random_category",
                      urgence: "super_critical",
                      action_requise: "None",
                      pourquoi: "Why not",
                      brouillon_reponse: "Ok"
                    }
                  ],
                  statistiques: {
                      par_categorie: {},
                      par_urgence: {}
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

    const conversations = [{
        contactName: "Test User",
        messages: [{
            direction: "incoming",
            body: "Hello",
            timestamp: Date.now()
        }],
        stats: {
            incoming: 1,
            outgoing: 0,
            categories: {},
            urgencies: {}
        }
    }];

    const result = await service.generateFullReport(conversations, {});

    // VERIFY SECURE BEHAVIOR
    assert.strictEqual(result.raw.conclusion.length, 1000, "Conclusion SHOULD be truncated to 1000 chars");
    assert.strictEqual(result.raw.malicious_script, undefined, "Malicious script SHOULD be stripped");
    assert.strictEqual(result.raw.taches[0].hidden_payload, undefined, "Hidden payload SHOULD be stripped");
    assert.strictEqual(result.raw.taches[0].titre, "Task 1", "Valid fields should be preserved");

    // Verify enum fallback
    assert.strictEqual(result.raw.messages_actionnables[0].categorie, 'personnel', 'Invalid category should fallback to personnel');
    assert.strictEqual(result.raw.messages_actionnables[0].urgence, 'basse', 'Invalid urgency should fallback to basse');
  });
});
