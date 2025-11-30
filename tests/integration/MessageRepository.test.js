import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { SQLiteDatabase } from '../../src/repositories/Database.js';
import { MessageRepository } from '../../src/repositories/MessageRepository.js';
import { Message } from '../../src/domain/Message.js';

describe('MessageRepository Integration', () => {
  // Use unique database paths for each test to avoid conflicts
  const getTestDbPath = () => path.join(process.cwd(), 'tests', `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  let testDbPath;
  let db;
  let repository;

  beforeEach(() => {
    testDbPath = getTestDbPath();
    
    const config = {
      database: { path: testDbPath }
    };
    
    db = new SQLiteDatabase(config);
    repository = new MessageRepository(db);
  });

  afterEach(() => {
    // Close database connection first
    if (db && db.close) {
      try {
        db.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    
    // Clean up test database
    setTimeout(() => {
      try {
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
        // Also clean up WAL files
        if (fs.existsSync(testDbPath + '-wal')) {
          fs.unlinkSync(testDbPath + '-wal');
        }
        if (fs.existsSync(testDbPath + '-shm')) {
          fs.unlinkSync(testDbPath + '-shm');
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }, 100);
  });

  describe('Contacts', () => {
    it('should create a new contact', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net', {
        pushName: 'John',
        displayName: 'John Doe'
      });

      assert.ok(contact.id);
      assert.strictEqual(contact.phone_number, 'user1@s.whatsapp.net');
      assert.strictEqual(contact.push_name, 'John');
      assert.strictEqual(contact.display_name, 'John Doe');
    });

    it('should return existing contact on duplicate', () => {
      const contact1 = repository.findOrCreateContact('user1@s.whatsapp.net', { pushName: 'John' });
      const contact2 = repository.findOrCreateContact('user1@s.whatsapp.net', { pushName: 'Johnny' });

      assert.strictEqual(contact1.id, contact2.id);
    });

    it('should get contact by phone number', () => {
      repository.findOrCreateContact('user1@s.whatsapp.net', { pushName: 'John' });
      
      const contact = repository.getContactByPhone('user1@s.whatsapp.net');
      
      assert.ok(contact);
      assert.strictEqual(contact.push_name, 'John');
    });
  });

  describe('Messages', () => {
    it('should save incoming message', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net');
      
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello World',
        timestamp: Date.now()
      });

      const messageId = repository.saveIncomingMessage(message, contact.id, {
        isForwarded: false
      });

      assert.ok(messageId);
      
      const saved = repository.getMessageByInternalId(messageId);
      assert.strictEqual(saved.body, 'Hello World');
      assert.strictEqual(saved.direction, 'incoming');
    });

    it('should save outgoing message', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net');
      
      const messageId = repository.saveOutgoingMessage(
        'msg-out-001',
        contact.id,
        'Hello from bot',
        Date.now()
      );

      assert.ok(messageId);
      
      const saved = repository.getMessageByInternalId(messageId);
      assert.strictEqual(saved.direction, 'outgoing');
    });

    it('should update contact stats on message save', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net');
      
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Test',
        timestamp: Date.now()
      });

      repository.saveIncomingMessage(message, contact.id);
      
      const updatedContact = repository.getContactById(contact.id);
      assert.strictEqual(updatedContact.total_messages_received, 1);
    });
  });

  describe('findRecent (legacy compatibility)', () => {
    it('should retrieve messages in chronological order', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net');
      const now = Date.now();
      
      const messages = [
        new Message({ id: 'msg-001', from: 'user1@s.whatsapp.net', body: 'First', timestamp: now - 2000 }),
        new Message({ id: 'msg-002', from: 'user1@s.whatsapp.net', body: 'Second', timestamp: now - 1000 }),
        new Message({ id: 'msg-003', from: 'user1@s.whatsapp.net', body: 'Third', timestamp: now })
      ];
      
      messages.forEach(m => repository.saveIncomingMessage(m, contact.id));
      
      const results = repository.findRecent('user1@s.whatsapp.net', 10);
      
      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0].body, 'First');
      assert.strictEqual(results[1].body, 'Second');
      assert.strictEqual(results[2].body, 'Third');
    });

    it('should respect limit parameter', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net');
      const now = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const message = new Message({
          id: `msg-${i}`,
          from: 'user1@s.whatsapp.net',
          body: `Message ${i}`,
          timestamp: now + i * 1000
        });
        repository.saveIncomingMessage(message, contact.id);
      }
      
      const results = repository.findRecent('user1@s.whatsapp.net', 3);
      
      assert.strictEqual(results.length, 3);
    });
  });

  describe('Analysis', () => {
    it('should save and retrieve analysis', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net');
      
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello',
        timestamp: Date.now()
      });

      const messageDbId = repository.saveIncomingMessage(message, contact.id);
      
      repository.saveAnalysis(messageDbId, {
        intent: 'greeting',
        urgency: 'low',
        category: 'personal',
        sentiment: 'positive',
        confidence: 0.95
      }, {
        processingTime: 150,
        model: 'gpt-4o',
        tokensUsed: 100
      });

      const analysis = repository.getAnalysisByMessageId(messageDbId);
      
      assert.ok(analysis);
      assert.strictEqual(analysis.intent, 'greeting');
      assert.strictEqual(analysis.urgency, 'low');
      assert.strictEqual(analysis.sentiment, 'positive');
      assert.strictEqual(analysis.processing_time_ms, 150);
    });
  });

  describe('Responses', () => {
    it('should save response', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net');
      
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello',
        timestamp: Date.now()
      });

      const messageDbId = repository.saveIncomingMessage(message, contact.id);
      
      const result = repository.saveResponse(messageDbId, 'Hello! How can I help?', 'auto');
      
      assert.ok(result.lastInsertRowid);
    });
  });

  describe('Errors', () => {
    it('should log errors', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net');
      
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello',
        timestamp: Date.now()
      });

      const messageDbId = repository.saveIncomingMessage(message, contact.id);
      
      repository.logError(messageDbId, 'APIError', 'Rate limit exceeded', 'Error stack...');

      const errors = repository.getRecentErrors(10);
      
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].error_type, 'APIError');
      assert.strictEqual(errors[0].error_message, 'Rate limit exceeded');
    });
  });

  describe('Statistics', () => {
    it('should generate daily stats', () => {
      const contact = repository.findOrCreateContact('user1@s.whatsapp.net');
      const today = new Date().toISOString().split('T')[0];
      
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello',
        timestamp: Date.now()
      });

      const messageDbId = repository.saveIncomingMessage(message, contact.id);
      repository.saveAnalysis(messageDbId, { urgency: 'high', category: 'professional' });

      const stats = repository.generateDailyStats(today);
      
      assert.strictEqual(stats.total_received, 1);
      assert.strictEqual(stats.unique_contacts, 1);
    });

    it('should get global stats', () => {
      const contact1 = repository.findOrCreateContact('user1@s.whatsapp.net');
      const contact2 = repository.findOrCreateContact('user2@s.whatsapp.net');
      
      repository.saveIncomingMessage(
        new Message({ id: 'msg-001', from: 'user1@s.whatsapp.net', body: 'Hi', timestamp: Date.now() }),
        contact1.id
      );
      repository.saveIncomingMessage(
        new Message({ id: 'msg-002', from: 'user2@s.whatsapp.net', body: 'Hello', timestamp: Date.now() }),
        contact2.id
      );

      const stats = repository.getGlobalStats();
      
      assert.strictEqual(stats.total_contacts, 2);
      assert.strictEqual(stats.total_messages_received, 2);
    });
  });

  describe('Legacy save method', () => {
    it('should work with legacy save method', () => {
      const message = new Message({
        id: 'msg-001',
        from: 'user1@s.whatsapp.net',
        body: 'Hello World',
        timestamp: Date.now(),
        urgency: 'low',
        category: 'personal'
      });

      repository.save(message);
      
      const results = repository.findRecent('user1@s.whatsapp.net', 10);
      
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].body, 'Hello World');
    });
  });
});
