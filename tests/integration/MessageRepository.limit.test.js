import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { SQLiteDatabase } from '../../src/repositories/Database.js';
import { MessageRepository } from '../../src/repositories/MessageRepository.js';
import { Message } from '../../src/domain/Message.js';

describe('MessageRepository Limit Integration', () => {
  const getTestDbPath = () => path.join(process.cwd(), 'tests', `test-db-limit-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
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

  it('should limit the number of contacts returned when limitContacts is provided', () => {
    // 1. Setup contacts
    const contacts = [];
    for (let i = 0; i < 5; i++) {
      contacts.push(repository.findOrCreateContact(`user${i}@s.whatsapp.net`, { pushName: `User ${i}` }));
    }

    // 2. Insert messages
    // Contact 0: 5 messages (Most active)
    // Contact 1: 4 messages
    // Contact 2: 3 messages
    // Contact 3: 2 messages
    // Contact 4: 1 message
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5 - i; j++) {
        const msg = new Message({
          id: `msg-${i}-${j}`,
          from: contacts[i].phone_number,
          body: `Message ${j} from user ${i}`,
          timestamp: now - (j * 1000)
        });
        repository.saveIncomingMessage(msg, contacts[i].id);
      }
    }

    // 3. Run report with limitContacts = 3
    const report = repository.getConversationsForReport(20, 3);

    // 4. Verify limit
    assert.strictEqual(report.length, 3, 'Should return exactly 3 contacts');

    // 5. Verify order (most active first)
    assert.strictEqual(report[0].phoneNumber, 'user0@s.whatsapp.net', 'Most active should be first');
    assert.strictEqual(report[1].phoneNumber, 'user1@s.whatsapp.net', 'Second most active should be second');
    assert.strictEqual(report[2].phoneNumber, 'user2@s.whatsapp.net', 'Third most active should be third');
  });

  it('should return empty array if no messages', () => {
    const report = repository.getConversationsForReport(20, 5);
    assert.deepStrictEqual(report, []);
  });

  it('should respect maxMessagesPerContact even with limitContacts', () => {
     // Contact 0: 5 messages
     const contact = repository.findOrCreateContact('user0@s.whatsapp.net');
     const now = Date.now();
     for(let i=0; i<5; i++) {
        repository.saveIncomingMessage(new Message({
          id: `msg-${i}`,
          from: 'user0@s.whatsapp.net',
          body: `Msg ${i}`,
          timestamp: now - i*1000
        }), contact.id);
     }

     // Limit contacts to 1, messages per contact to 2
     const report = repository.getConversationsForReport(2, 1);

     assert.strictEqual(report.length, 1);
     assert.strictEqual(report[0].messages.length, 2);
  });
});
