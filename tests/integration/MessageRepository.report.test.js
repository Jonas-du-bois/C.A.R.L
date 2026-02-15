import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { SQLiteDatabase } from '../../src/repositories/Database.js';
import { MessageRepository } from '../../src/repositories/MessageRepository.js';

describe('MessageRepository Report Integration', () => {
  const getTestDbPath = () => path.join(process.cwd(), 'tests', `test-db-report-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  let testDbPath;
  let db;
  let repository;

  beforeEach(() => {
    testDbPath = getTestDbPath();
    const config = { database: { path: testDbPath } };
    db = new SQLiteDatabase(config);
    repository = new MessageRepository(db);
  });

  afterEach(() => {
    if (db && db.close) try { db.close(); } catch (e) {}
    setTimeout(() => {
      try {
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
        if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
      } catch (e) {}
    }, 100);
  });

  it('should retrieve conversations for report with correct message sorting', () => {
    // Insert test data
    const contacts = [];
    for (let i = 0; i < 3; i++) {
      const contact = repository.findOrCreateContact(`+123456789${i}`, { pushName: `User ${i}` });
      contacts.push(contact);
    }

    // Insert messages distributed among contacts and time
    const now = Date.now();
    // Use timestamps within the current day (since getConversationsForReport filters since midnight)
    // We assume the test runs in an environment where "today" means since midnight local time.
    // To be safe, we insert messages with timestamp = now.

    const messagesToInsert = [];
    for (let i = 0; i < 30; i++) {
      const contactIdx = i % 3;
      const timeOffset = i * 1000; // 1 second apart
      const timestamp = now - 30000 + timeOffset; // last 30 seconds

      messagesToInsert.push({
        id: `msg_${i}`,
        body: `Message ${i}`,
        timestamp: timestamp,
        from: contacts[contactIdx].phone_number,
        contactId: contacts[contactIdx].id
      });
    }

    // Shuffle messages
    messagesToInsert.sort(() => Math.random() - 0.5);

    for (const msg of messagesToInsert) {
      repository.saveIncomingMessage(msg, msg.contactId, { skipStatsUpdate: false });
    }

    // Run the method
    const conversations = repository.getConversationsForReport();

    // Verify correctness
    assert.strictEqual(conversations.length, 3, 'Should have 3 conversations');

    // Verify messages are sorted by timestamp within each conversation
    for (const conv of conversations) {
      let lastTs = 0;
      for (const msg of conv.messages) {
        assert.ok(msg.timestamp >= lastTs, `Messages should be sorted by time. ${msg.timestamp} < ${lastTs}`);
        lastTs = msg.timestamp;
      }
    }

    // Verify grouping
    const counts = conversations.map(c => c.messages.length);
    assert.strictEqual(counts.reduce((a, b) => a + b, 0), 30);
  });
});
