import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MessageHandler } from '../../src/handlers/MessageHandler.js';

describe('MessageHandler Order Optimization', () => {
  it('should call sendMessage BEFORE saveAnalysis to reduce user waiting time', async () => {
    const callOrder = [];

    // Mocks
    const gatekeeper = {
      shouldProcess: () => true
    };

    const repo = {
      findOrCreateContact: () => ({ id: 1 }),
      findRecentByContactId: () => [], // Use the new method
      saveIncomingMessage: () => 1,
      saveAnalysis: () => {
        callOrder.push('saveAnalysis');
      },
      saveResponse: () => {},
      saveOutgoingMessage: () => {},
      createAction: () => {},
      updateActionStatus: () => {},
      logError: () => {}
    };

    const whatsapp = {
      sendStateTyping: async () => {},
      sendMessage: async () => {
        callOrder.push('sendMessage');
        return { id: { _serialized: 'msg_id' } };
      }
    };

    const openAI = {
      analyzeMessage: async () => {
        return {
          reply: 'Hello',
          action: 'none',
          urgency: 'low',
          category: 'other',
          confidence: 1.0,
          tokensUsed: 10
        };
      }
    };

    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {}
    };

    const handler = new MessageHandler({
      gatekeeper,
      openAI,
      calendar: null,
      repository: repo,
      whatsapp,
      logger,
      telegram: null
    });

    const message = {
      from: '123456789@c.us',
      body: 'Hi'
    };

    // Note: This will take ~2 seconds due to simulateTyping delay which cannot be easily mocked (private #sleep)
    await handler.handle(message);

    console.log('Call Order:', callOrder);

    // We expect sendMessage to be called BEFORE saveAnalysis
    const sendMessageIndex = callOrder.indexOf('sendMessage');
    const saveAnalysisIndex = callOrder.indexOf('saveAnalysis');

    assert.ok(sendMessageIndex !== -1, 'sendMessage was not called');
    assert.ok(saveAnalysisIndex !== -1, 'saveAnalysis was not called');

    // This assertion will FAIL before the optimization
    assert.ok(sendMessageIndex < saveAnalysisIndex, 'sendMessage should be called BEFORE saveAnalysis');
  });
});
