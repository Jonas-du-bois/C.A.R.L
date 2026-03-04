import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { SQLiteDatabase } from '../../src/repositories/Database.js';
import { MessageRepository } from '../../src/repositories/MessageRepository.js';
import { Message } from '../../src/domain/Message.js';

describe('MessageRepository Limit Optimization Integration', () => {
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

  it('getConversationsForReport should only fetch messages for top N contacts when limitContacts is provided', () => {
    // 1. Setup contacts
    const contacts = [];
    for (let i = 1; i <= 6; i++) {
      contacts.push(repository.findOrCreateContact(`user${i}@s.whatsapp.net`, { pushName: `User ${i}` }));
    }

    const now = Date.now();

    // User 1: 6 messages
    for (let i = 0; i < 6; i++) repository.saveIncomingMessage(new Message({ id: `msg-u1-${i}`, from: 'user1@s.whatsapp.net', body: 'Msg', timestamp: now - 1000 }), contacts[0].id);

    // User 2: 5 messages
    for (let i = 0; i < 5; i++) repository.saveIncomingMessage(new Message({ id: `msg-u2-${i}`, from: 'user2@s.whatsapp.net', body: 'Msg', timestamp: now - 2000 }), contacts[1].id);

    // User 3: 4 messages
    for (let i = 0; i < 4; i++) repository.saveIncomingMessage(new Message({ id: `msg-u3-${i}`, from: 'user3@s.whatsapp.net', body: 'Msg', timestamp: now - 3000 }), contacts[2].id);

    // User 4: 3 messages
    for (let i = 0; i < 3; i++) repository.saveIncomingMessage(new Message({ id: `msg-u4-${i}`, from: 'user4@s.whatsapp.net', body: 'Msg', timestamp: now - 4000 }), contacts[3].id);

    // User 5: 2 messages
    for (let i = 0; i < 2; i++) repository.saveIncomingMessage(new Message({ id: `msg-u5-${i}`, from: 'user5@s.whatsapp.net', body: 'Msg', timestamp: now - 5000 }), contacts[4].id);

    // User 6: 1 message (Should be excluded if we limit to 5)
    for (let i = 0; i < 1; i++) repository.saveIncomingMessage(new Message({ id: `msg-u6-${i}`, from: 'user6@s.whatsapp.net', body: 'Msg', timestamp: now - 6000 }), contacts[5].id);

    // Call without limitContacts => all 6 contacts
    const allReport = repository.getConversationsForReport(20);
    assert.strictEqual(allReport.length, 6, 'Should return all 6 active contacts without limit');

    // Call with limitContacts = 3 => top 3 contacts (User 1, User 2, User 3)
    const limitedReport = repository.getConversationsForReport(20, 3);
    assert.strictEqual(limitedReport.length, 3, 'Should return only top 3 active contacts');
    assert.strictEqual(limitedReport[0].phoneNumber, 'user1@s.whatsapp.net');
    assert.strictEqual(limitedReport[1].phoneNumber, 'user2@s.whatsapp.net');
    assert.strictEqual(limitedReport[2].phoneNumber, 'user3@s.whatsapp.net');
    assert.strictEqual(limitedReport[0].messages.length, 6);
    assert.strictEqual(limitedReport[1].messages.length, 5);
    assert.strictEqual(limitedReport[2].messages.length, 4);

    // Ensure User 6 is not in the top 5
    const top5Report = repository.getConversationsForReport(20, 5);
    assert.strictEqual(top5Report.length, 5, 'Should return top 5 contacts');
    const user6Present = top5Report.some(c => c.phoneNumber === 'user6@s.whatsapp.net');
    assert.strictEqual(user6Present, false, 'User 6 should be excluded from top 5');
  });

  it('getConversationsForReport should handle limitContacts when no messages exist today', () => {
    const report = repository.getConversationsForReport(20, 5);
    assert.strictEqual(report.length, 0, 'Should return empty array when no messages exist');
  });
});
