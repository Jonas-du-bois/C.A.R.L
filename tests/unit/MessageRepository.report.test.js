import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MessageRepository } from '../../src/repositories/MessageRepository.js';
import { SQLiteDatabase } from '../../src/repositories/Database.js';

describe('MessageRepository Report Optimization', () => {
  const dbPath = ':memory:';
  const config = { database: { path: dbPath } };

  const database = new SQLiteDatabase(config);
  const repo = new MessageRepository(database);

  it('getConversationsForReport should support explicit limit optimization', () => {
    // 1. Create 20 contacts with increasing message counts
    for (let i = 1; i <= 20; i++) {
      const phoneNumber = `12345678${i.toString().padStart(2, '0')}`;
      const contact = repo.findOrCreateContact(phoneNumber, { pushName: `Contact ${i}` });

      for (let m = 0; m < i; m++) {
        repo.saveIncomingMessage(
          { id: `msg_${i}_${m}`, body: `Message ${m}`, timestamp: Date.now(), from: phoneNumber },
          contact.id
        );
      }
    }

    // 2. Call getConversationsForReport WITHOUT limit (default behavior)
    const allConversations = repo.getConversationsForReport();
    assert.strictEqual(allConversations.length, 20, 'Should return ALL 20 conversations by default');

    // 3. Call getConversationsForReport WITH limit 15 (optimized behavior)
    const limitedConversations = repo.getConversationsForReport(20, 15);
    assert.strictEqual(limitedConversations.length, 15, 'Should return exactly 15 conversations when limit is provided');

    // Verify sorting (most active first)
    // First should be Contact 20 (20 msgs)
    const first = limitedConversations[0];
    const last = limitedConversations[14];

    assert.strictEqual(first.messages.length, 20, 'First conversation should have 20 messages'); // Contact 20
    assert.strictEqual(last.messages.length, 6, 'Last conversation should have 6 messages'); // Contact 6

    // Verify exclusion
    const phoneNumbers = limitedConversations.map(c => c.phoneNumber);
    assert.ok(!phoneNumbers.includes('1234567805'), 'Contact 5 should not be present');
    assert.ok(phoneNumbers.includes('1234567820'), 'Contact 20 should be present');
  });

  it('getConversationsForReport should handle empty database gracefully', () => {
     const db2 = new SQLiteDatabase({ database: { path: ':memory:' } });
     const repo2 = new MessageRepository(db2);

     const conversations = repo2.getConversationsForReport(20, 15);
     assert.deepStrictEqual(conversations, [], 'Should return empty array');
  });
});
