import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MessageHandler } from '../../src/handlers/MessageHandler.js';

describe('MessageHandler Performance', () => {
  it('should process message sequentially (baseline check) and then in parallel (after optimization)', async () => {
    const startTime = Date.now();

    // Mocks
    const gatekeeper = {
      shouldProcess: () => true
    };

    const repo = {
      findOrCreateContact: () => ({ id: 1 }),
      saveIncomingMessage: () => 1,
      findRecent: () => [],
      saveAnalysis: () => true,
      saveResponse: () => true,
      saveOutgoingMessage: () => true,
      logError: () => {},
      createAction: () => {},
      updateActionStatus: () => {}
    };

    const whatsapp = {
      sendStateTyping: async () => {}, // Instant
      sendMessage: async () => ({ id: { _serialized: 'msg_id' } })
    };

    const openAI = {
      analyzeMessage: async () => {
        // Simulate 1000ms delay for AI processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          reply: 'Hello',
          action: 'none',
          urgency: 'low',
          category: 'other',
          confidence: 1.0
        };
      }
    };

    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {}
    };

    const telegram = {
        sendMessage: async () => {}
    };

    const handler = new MessageHandler({
      gatekeeper,
      openAI,
      calendar: null,
      repository: repo,
      whatsapp,
      logger,
      telegram
    });

    // Use short message to force minimum delay of 2000ms
    const message = {
      from: '123456789@c.us',
      body: 'Hi'
    };

    await handler.handle(message);

    const duration = Date.now() - startTime;
    console.log(`Execution time: ${duration}ms`);

    // Baseline (Sequential): 2000ms (typing) + 1000ms (AI) = ~3000ms
    // Optimized (Parallel): max(2000ms, 1000ms) = ~2000ms
  });
});
