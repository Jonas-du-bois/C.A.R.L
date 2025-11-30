import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Message } from '../../src/domain/Message.js';

describe('Message', () => {
  describe('constructor', () => {
    it('should create a message with required fields', () => {
      const message = new Message({
        id: 'msg-123',
        from: '+33612345678@s.whatsapp.net',
        body: 'Hello world'
      });

      assert.strictEqual(message.id, 'msg-123');
      assert.strictEqual(message.from, '+33612345678@s.whatsapp.net');
      assert.strictEqual(message.body, 'Hello world');
      assert.strictEqual(message.urgency, 'low');
      assert.strictEqual(message.category, 'other');
    });

    it('should throw ValidationError when id is missing', () => {
      assert.throws(() => {
        new Message({
          from: '+33612345678@s.whatsapp.net',
          body: 'Hello'
        });
      }, { name: 'ValidationError' });
    });

    it('should throw ValidationError when from is missing', () => {
      assert.throws(() => {
        new Message({
          id: 'msg-123',
          body: 'Hello'
        });
      }, { name: 'ValidationError' });
    });

    it('should throw ValidationError when body is missing', () => {
      assert.throws(() => {
        new Message({
          id: 'msg-123',
          from: '+33612345678@s.whatsapp.net'
        });
      }, { name: 'ValidationError' });
    });

    it('should set default timestamp to current time', () => {
      const before = Date.now();
      const message = new Message({
        id: 'msg-123',
        from: '+33612345678@s.whatsapp.net',
        body: 'Hello'
      });
      const after = Date.now();

      assert.ok(message.timestamp >= before);
      assert.ok(message.timestamp <= after);
    });

    it('should use provided timestamp', () => {
      const timestamp = 1700000000000;
      const message = new Message({
        id: 'msg-123',
        from: '+33612345678@s.whatsapp.net',
        body: 'Hello',
        timestamp
      });

      assert.strictEqual(message.timestamp, timestamp);
    });

    it('should remove zero-width characters from body', () => {
      const message = new Message({
        id: 'msg-123',
        from: '+33612345678@s.whatsapp.net',
        body: 'Hello\u200BWorld\u200C!'
      });

      assert.strictEqual(message.body, 'HelloWorld!');
    });

    it('should truncate body to 4096 characters', () => {
      const longBody = 'A'.repeat(5000);
      const message = new Message({
        id: 'msg-123',
        from: '+33612345678@s.whatsapp.net',
        body: longBody
      });

      assert.strictEqual(message.body.length, 4096);
    });
  });

  describe('withAnalysis', () => {
    it('should create a new message with analysis data', () => {
      const message = new Message({
        id: 'msg-123',
        from: '+33612345678@s.whatsapp.net',
        body: 'Hello',
        timestamp: 1700000000000
      });

      const analysis = {
        urgency: 'high',
        category: 'professional'
      };

      const analyzedMessage = message.withAnalysis(analysis);

      assert.strictEqual(analyzedMessage.id, 'msg-123');
      assert.strictEqual(analyzedMessage.from, '+33612345678@s.whatsapp.net');
      assert.strictEqual(analyzedMessage.body, 'Hello');
      assert.strictEqual(analyzedMessage.timestamp, 1700000000000);
      assert.strictEqual(analyzedMessage.urgency, 'high');
      assert.strictEqual(analyzedMessage.category, 'professional');
    });

    it('should not modify the original message', () => {
      const message = new Message({
        id: 'msg-123',
        from: '+33612345678@s.whatsapp.net',
        body: 'Hello'
      });

      const analysis = {
        urgency: 'critical',
        category: 'spam'
      };

      message.withAnalysis(analysis);

      assert.strictEqual(message.urgency, 'low');
      assert.strictEqual(message.category, 'other');
    });
  });

  describe('toJSON', () => {
    it('should return a plain object representation', () => {
      const message = new Message({
        id: 'msg-123',
        from: '+33612345678@s.whatsapp.net',
        body: 'Hello',
        timestamp: 1700000000000,
        urgency: 'high',
        category: 'professional'
      });

      const json = message.toJSON();

      assert.deepStrictEqual(json, {
        id: 'msg-123',
        from: '+33612345678@s.whatsapp.net',
        body: 'Hello',
        timestamp: 1700000000000,
        urgency: 'high',
        category: 'professional'
      });
    });
  });
});
