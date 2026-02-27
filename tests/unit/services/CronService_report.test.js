
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CronService } from '../../../src/services/CronService.js';

describe('CronService Unit Tests', () => {
  it('formatBasicReport should format report correctly with only stats', () => {
    // We can't instantiate CronService easily without dependencies, but we can access the private method
    // if we are creative, or we can just test the logic by copying it here since it's private.
    // However, to be robust, let's try to instantiate with mocks.

    const mockRepo = {};
    const mockTelegram = {};
    const mockLogger = { info: () => {}, error: () => {} };
    const mockConfig = { features: { enableDailyBriefing: false } }; // Disable cron start

    const cronService = new CronService(mockConfig, mockRepo, mockTelegram, mockLogger);

    // Access private method using array notation if it wasn't a # private field.
    // But it is #formatBasicReport. We can't access it directly.
    // We have to test `generateAndSendReport` with mocked repo returning stats and no AI service.

    let sentMessage = '';
    mockTelegram.sendMessage = async (msg) => { sentMessage = msg; };

    mockRepo.getQuickStats = () => ({
      received: 10,
      sent: 5,
      contacts: 3,
      errors: 1
    });

    mockRepo.getConversationsForReport = () => [];

    // Run generation
    // We need to await it

    return cronService.generateAndSendReport().then(() => {
        assert.ok(sentMessage.includes('Messages reçus: 10'));
        assert.ok(sentMessage.includes('Réponses: 5'));
        assert.ok(sentMessage.includes('Contacts: 3'));
        assert.ok(sentMessage.includes('Erreurs: 1'));
        assert.ok(!sentMessage.includes('Total messages'), 'Should not try to count total messages from array anymore');
    });
  });
});
