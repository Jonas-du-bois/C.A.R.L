
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { MessageHandler } from '../../src/handlers/MessageHandler.js';

describe('MessageHandler Security Tests', () => {
  const mockRepo = {
    findOrCreateContact: mock.fn(() => ({ id: 1 })),
    findRecentByContactId: mock.fn(() => []),
    saveIncomingMessage: mock.fn(() => 1),
    saveAnalysis: mock.fn(),
    saveResponse: mock.fn(),
    saveOutgoingMessage: mock.fn(),
    createAction: mock.fn(),
    updateActionStatus: mock.fn(),
    logError: mock.fn()
  };

  const mockOpenAI = {
    analyzeMessage: mock.fn(async () => ({
      reply: 'Test reply',
      action: 'notify_admin',
      urgency: 'high',
      category: 'other',
      confidence: 0.9
    }))
  };

  const mockWhatsapp = {
    sendMessage: mock.fn(async () => ({ id: { _serialized: 'msg_123' } })),
    sendStateTyping: mock.fn(async () => {})
  };

  const mockTelegram = {
    sendMessage: mock.fn(async () => {})
  };

  const mockLogger = {
    info: mock.fn(),
    warn: mock.fn(),
    error: mock.fn()
  };

  const mockGatekeeper = {
      shouldProcess: mock.fn(() => true)
  };

  const handler = new MessageHandler({
    gatekeeper: mockGatekeeper,
    openAI: mockOpenAI,
    calendar: null,
    repository: mockRepo,
    whatsapp: mockWhatsapp,
    logger: mockLogger,
    telegram: mockTelegram
  });

  afterEach(() => {
    mock.reset();
  });

  it('should escape HTML in Telegram notifications to prevent injection', async () => {
    const maliciousMessage = {
      from: '123456789',
      body: '<b>Bold</b> <script>alert(1)</script>'
    };

    // Analyze returns action: 'notify_admin'
    mockOpenAI.analyzeMessage.mock.mockImplementationOnce(async () => ({
      reply: 'Reply',
      action: 'notify_admin',
      urgency: 'high',
      category: 'other',
      confidence: 0.9
    }));

    await handler.handle(maliciousMessage);

    // Check Telegram sendMessage call
    const calls = mockTelegram.sendMessage.mock.calls;
    assert.strictEqual(calls.length, 1);

    const sentMessage = calls[0].arguments[0];

    // Should verify that tags are escaped
    assert.ok(sentMessage.includes('&lt;b&gt;Bold&lt;/b&gt;'), 'HTML tags not escaped');
    assert.ok(sentMessage.includes('&lt;script&gt;'), 'Script tags not escaped');
    assert.ok(!sentMessage.includes('<b>'), 'Raw HTML tag found');
  });
});
