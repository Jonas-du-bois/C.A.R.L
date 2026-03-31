import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SQLiteDatabase } from '../../src/repositories/Database.js';
import { MessageRepository } from '../../src/repositories/MessageRepository.js';

describe('MessageRepository.messageExists', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = new SQLiteDatabase({ database: { path: ':memory:' } });
    repo = new MessageRepository(db);
    repo.findOrCreateContact('123456789', { pushName: 'Test', isGroup: false });
  });

  afterEach(() => {
    db.close();
  });

  it('should return false if message does not exist', () => {
    assert.strictEqual(repo.messageExists('non-existent-id'), false);
  });

  it('should return true if message exists', () => {
    repo.saveIncomingMessage({ id: 'existing-id', body: 'hello', timestamp: Date.now() }, 1);
    assert.strictEqual(repo.messageExists('existing-id'), true);
  });
});
