import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { MessageHandler } from '../../src/handlers/MessageHandler.js';
import { Message } from '../../src/domain/Message.js';

describe('MessageHandler Integration', () => {
  let handler;
  let mockGatekeeper;
  let mockOpenAI;
  let mockCalendar;
  let mockRepository;
  let mockWhatsApp;
  let mockLogger;
  let mockTelegram;

  beforeEach(() => {
    // Create mock objects
    mockGatekeeper = {
      shouldProcess: () => true
    };

    mockOpenAI = {
      analyzeMessage: async () => ({
        reply: 'Test reply',
        action: 'none',
        intent: 'greeting',
        urgency: 'low',
        category: 'personal',
        sentiment: 'neutral',
        confidence: 0.95
      })
    };

    mockCalendar = {
      createEvent: async () => 'Event created'
    };

    mockRepository = {
      contacts: new Map(),
      messages: [],
      analyses: [],
      responses: [],
      errors: [],
      actions: [],
      findOrCreateContact: function(phone, meta = {}) {
        if (!this.contacts.has(phone)) {
          this.contacts.set(phone, { 
            id: this.contacts.size + 1, 
            phone_number: phone,
            ...meta
          });
        }
        return this.contacts.get(phone);
      },
      saveIncomingMessage: function(msg, contactId, meta = {}) {
        const id = this.messages.length + 1;
        this.messages.push({ id, message_id: msg.id, contact_id: contactId, ...meta });
        return id;
      },
      saveOutgoingMessage: function(msgId, contactId, body, timestamp) {
        const id = this.messages.length + 1;
        this.messages.push({ id, message_id: msgId, contact_id: contactId, body, direction: 'outgoing' });
        return id;
      },
      findRecent: function() { return []; },
      saveAnalysis: function(msgId, analysis, meta = {}) {
        this.analyses.push({ message_id: msgId, ...analysis, ...meta });
      },
      saveResponse: function(msgId, text, type) {
        this.responses.push({ message_id: msgId, response_text: text, response_type: type });
      },
      logError: function(msgId, type, message, stack) {
        this.errors.push({ message_id: msgId, error_type: type, error_message: message });
      },
      createAction: function(msgId, type, data) {
        const id = this.actions.length + 1;
        this.actions.push({ id, message_id: msgId, action_type: type, action_data: data });
        return { lastInsertRowid: id };
      },
      updateActionStatus: function(id, status, result) {
        const action = this.actions.find(a => a.id === id);
        if (action) action.status = status;
      }
    };

    mockWhatsApp = {
      typingSent: false,
      messages: [],
      sendStateTyping: async function() { this.typingSent = true; },
      sendMessage: async function(to, content) { 
        this.messages.push({ to, content }); 
        return { id: { _serialized: 'sent-msg-001' } };
      }
    };

    mockLogger = {
      logs: [],
      info: function(msg, meta) { this.logs.push({ level: 'info', msg, meta }); },
      warn: function(msg, meta) { this.logs.push({ level: 'warn', msg, meta }); },
      error: function(msg, meta) { this.logs.push({ level: 'error', msg, meta }); }
    };

    mockTelegram = {
      messages: [],
      sendMessage: async function(msg) { this.messages.push(msg); }
    };

    handler = new MessageHandler({
      gatekeeper: mockGatekeeper,
      openAI: mockOpenAI,
      calendar: mockCalendar,
      repository: mockRepository,
      whatsapp: mockWhatsApp,
      logger: mockLogger,
      telegram: mockTelegram
    });
  });

  describe('handle', () => {
    it('should save message BEFORE OpenAI processing', async () => {
      let messageWasSavedBeforeOpenAI = false;
      
      mockOpenAI.analyzeMessage = async () => {
        // At this point, message should already be saved
        messageWasSavedBeforeOpenAI = mockRepository.messages.length > 0;
        return {
          reply: 'Test reply',
          action: 'none',
          urgency: 'low',
          category: 'personal',
          confidence: 0.95
        };
      };

      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello'
      });

      await handler.handle(message);

      assert.strictEqual(messageWasSavedBeforeOpenAI, true, 'Message should be saved before OpenAI call');
    });

    it('should create contact and save message', async () => {
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello'
      });

      await handler.handle(message, { pushName: 'John' });

      // Should have created contact
      assert.strictEqual(mockRepository.contacts.size, 1);
      assert.ok(mockRepository.contacts.has('user1@s.whatsapp.net'));
      
      // Should have saved message
      assert.strictEqual(mockRepository.messages.length, 2); // incoming + outgoing
    });

    it('should save analysis after OpenAI processing', async () => {
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello'
      });

      await handler.handle(message);

      assert.strictEqual(mockRepository.analyses.length, 1);
      assert.strictEqual(mockRepository.analyses[0].urgency, 'low');
      assert.strictEqual(mockRepository.analyses[0].category, 'personal');
    });

    it('should save response after sending', async () => {
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello'
      });

      await handler.handle(message);

      assert.strictEqual(mockRepository.responses.length, 1);
      assert.strictEqual(mockRepository.responses[0].response_text, 'Test reply');
    });

    it('should process a message through the full pipeline', async () => {
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello'
      });

      await handler.handle(message);

      // Should have sent typing indicator
      assert.strictEqual(mockWhatsApp.typingSent, true);
      
      // Should have sent a reply
      assert.strictEqual(mockWhatsApp.messages.length, 1);
      assert.strictEqual(mockWhatsApp.messages[0].to, 'user1@s.whatsapp.net');
      assert.strictEqual(mockWhatsApp.messages[0].content, 'Test reply');
    });

    it('should skip messages blocked by gatekeeper', async () => {
      mockGatekeeper.shouldProcess = () => false;

      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello'
      });

      await handler.handle(message);

      // Should not have sent anything
      assert.strictEqual(mockWhatsApp.messages.length, 0);
      assert.strictEqual(mockRepository.messages.length, 0);
      
      // Should have logged a warning
      const warnLog = mockLogger.logs.find(l => l.level === 'warn');
      assert.ok(warnLog);
    });

    it('should create calendar event when action is calendar_event', async () => {
      let calendarCalled = false;
      mockCalendar.createEvent = async () => {
        calendarCalled = true;
        return 'Event created';
      };

      mockOpenAI.analyzeMessage = async () => ({
        reply: 'Meeting scheduled',
        action: 'calendar_event',
        urgency: 'medium',
        category: 'professional',
        confidence: 0.9
      });

      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Schedule a meeting for tomorrow'
      });

      await handler.handle(message);

      assert.strictEqual(calendarCalled, true);
      assert.ok(mockRepository.actions.some(a => a.action_type === 'calendar_event'));
    });

    it('should notify admin when action is notify_admin', async () => {
      mockOpenAI.analyzeMessage = async () => ({
        reply: 'I will notify Jonas',
        action: 'notify_admin',
        urgency: 'high',
        category: 'professional',
        confidence: 0.85
      });

      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'This is urgent!'
      });

      await handler.handle(message);

      assert.ok(mockTelegram.messages.some(m => m.includes('Urgent message')));
    });

    it('should notify admin for critical urgency', async () => {
      mockOpenAI.analyzeMessage = async () => ({
        reply: 'Handling critical situation',
        action: 'none',
        urgency: 'critical',
        category: 'professional',
        confidence: 0.95
      });

      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Emergency!'
      });

      await handler.handle(message);

      assert.ok(mockTelegram.messages.some(m => m.includes('Critical urgency')));
    });

    it('should log errors to database when OpenAI fails', async () => {
      mockOpenAI.analyzeMessage = async () => {
        throw new Error('OpenAI API error');
      };

      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello'
      });

      await handler.handle(message);

      // Should have logged error to database
      assert.strictEqual(mockRepository.errors.length, 1);
      assert.strictEqual(mockRepository.errors[0].error_type, 'Error');
      assert.strictEqual(mockRepository.errors[0].error_message, 'OpenAI API error');
      
      // Should have notified via Telegram
      assert.ok(mockTelegram.messages.some(m => m.includes('Error')));
    });

    it('should still have message saved even if OpenAI fails', async () => {
      mockOpenAI.analyzeMessage = async () => {
        throw new Error('Rate limit exceeded');
      };

      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello'
      });

      await handler.handle(message);

      // Message should still be saved!
      assert.strictEqual(mockRepository.messages.length, 1);
      assert.strictEqual(mockRepository.messages[0].message_id, 'msg-001');
    });
  });
});
