import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { SQLiteDatabase } from '../../src/repositories/Database.js';
import { MessageRepository } from '../../src/repositories/MessageRepository.js';
import { Message } from '../../src/domain/Message.js';

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

  it('getConversationsForReport should return conversations grouped by contact and sorted by activity', () => {
    // 1. Setup contacts
    const contact1 = repository.findOrCreateContact('user1@s.whatsapp.net', { pushName: 'Alice' });
    const contact2 = repository.findOrCreateContact('user2@s.whatsapp.net', { pushName: 'Bob' });
    const contact3 = repository.findOrCreateContact('user3@s.whatsapp.net', { pushName: 'Charlie' });

    // 2. Insert messages for today
    // We need to override the time logic in repository or mock Date.now()
    // but the repository uses SQL `strftime('%s', 'now')` for defaults,
    // AND explicit `received_at` in `saveIncomingMessage`.
    // The `getConversationsForReport` uses `#getMidnightTimestamp` which uses `new Date()`.
    // So if we insert messages with `Date.now()`, they will be picked up.

    const now = Date.now();
    const messages = [
      // Bob has 3 messages (most active)
      { contact: contact2, body: 'Bob 1', time: now - 3000 },
      { contact: contact2, body: 'Bob 2', time: now - 2000 },
      { contact: contact2, body: 'Bob 3', time: now - 1000 },

      // Alice has 2 messages
      { contact: contact1, body: 'Alice 1', time: now - 5000 },
      { contact: contact1, body: 'Alice 2', time: now - 4000 },

      // Charlie has 1 message
      { contact: contact3, body: 'Charlie 1', time: now - 6000 },
    ];

    // Shuffle messages to ensure order is restored by query
    const shuffled = [...messages].sort(() => Math.random() - 0.5);

    for (const m of shuffled) {
      const msg = new Message({
        id: `msg-${Math.random()}`,
        from: m.contact.phone_number,
        body: m.body,
        timestamp: m.time
      });
      repository.saveIncomingMessage(msg, m.contact.id);
    }

    // 3. Run the report
    const report = repository.getConversationsForReport();

    // 4. Verify grouping and sorting of contacts (by activity count)
    assert.strictEqual(report.length, 3);

    // Expect Bob (3 msgs) -> Alice (2 msgs) -> Charlie (1 msg)
    assert.strictEqual(report[0].phoneNumber, 'user2@s.whatsapp.net');
    assert.strictEqual(report[0].messages.length, 3);

    assert.strictEqual(report[1].phoneNumber, 'user1@s.whatsapp.net');
    assert.strictEqual(report[1].messages.length, 2);

    assert.strictEqual(report[2].phoneNumber, 'user3@s.whatsapp.net');
    assert.strictEqual(report[2].messages.length, 1);

    // 5. Verify message order within conversation (should be chronological)
    const bobMsgs = report[0].messages;
    assert.strictEqual(bobMsgs[0].body, 'Bob 1');
    assert.strictEqual(bobMsgs[1].body, 'Bob 2');
    assert.strictEqual(bobMsgs[2].body, 'Bob 3');

    const aliceMsgs = report[1].messages;
    assert.strictEqual(aliceMsgs[0].body, 'Alice 1');
    assert.strictEqual(aliceMsgs[1].body, 'Alice 2');
  });

  it('should handle mixed incoming and outgoing messages', () => {
    const contact = repository.findOrCreateContact('user1@s.whatsapp.net', { pushName: 'Alice' });
    const now = Date.now();

    // Incoming 1
    repository.saveIncomingMessage(new Message({
      id: 'msg-in-1', from: 'user1@s.whatsapp.net', body: 'Hi', timestamp: now - 5000
    }), contact.id);

    // Outgoing 1
    repository.saveOutgoingMessage('msg-out-1', contact.id, 'Hello', now - 4000);

    // Incoming 2
    repository.saveIncomingMessage(new Message({
      id: 'msg-in-2', from: 'user1@s.whatsapp.net', body: 'How are you?', timestamp: now - 3000
    }), contact.id);

    const report = repository.getConversationsForReport();

    assert.strictEqual(report.length, 1);
    const msgs = report[0].messages;
    assert.strictEqual(msgs.length, 3);

    assert.strictEqual(msgs[0].body, 'Hi');
    assert.strictEqual(msgs[0].direction, 'incoming');

    assert.strictEqual(msgs[1].body, 'Hello');
    assert.strictEqual(msgs[1].direction, 'outgoing');

    assert.strictEqual(msgs[2].body, 'How are you?');
    assert.strictEqual(msgs[2].direction, 'incoming');
  });
});
