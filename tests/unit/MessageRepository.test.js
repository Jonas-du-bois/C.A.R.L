
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { MessageRepository } from '../../src/repositories/MessageRepository.js';

describe('MessageRepository Unit Tests', () => {
  const setup = () => {
    const mockDb = {
      prepare: mock.fn(),
      exec: mock.fn()
    };

    // Helper to mock prepare return
    const mockPrepare = (returnValue) => {
      mockDb.prepare.mock.mockImplementationOnce(() => ({
        get: mock.fn(() => returnValue),
        run: mock.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
        all: mock.fn(() => [returnValue])
      }));
    };

    const repo = new MessageRepository(mockDb);
    return { repo, mockDb };
  };

  describe('findOrCreateContact', () => {
    it('should return existing contact without update if metadata matches', () => {
      const { repo, mockDb } = setup();
      const existingContact = {
        id: 1,
        phone_number: '123@c.us',
        push_name: 'John',
        display_name: 'John Doe',
        is_group: 0
      };

      // Mock getContactByPhone
      mockDb.prepare.mock.mockImplementation((sql) => {
        if (sql.includes('SELECT * FROM contacts WHERE phone_number')) {
          return { get: mock.fn(() => existingContact) };
        }
        return { get: mock.fn(), run: mock.fn() };
      });

      const result = repo.findOrCreateContact('123@c.us', {
        pushName: 'John',
        displayName: 'John Doe'
      });

      assert.deepStrictEqual(result, existingContact);

      // Verify no UPDATE or INSERT was called
      const calls = mockDb.prepare.mock.calls;
      const updateCalls = calls.filter(c => c.arguments[0].includes('UPDATE contacts SET'));
      const insertCalls = calls.filter(c => c.arguments[0].includes('INSERT INTO contacts'));

      assert.strictEqual(updateCalls.length, 0, 'Should not call UPDATE');
      assert.strictEqual(insertCalls.length, 0, 'Should not call INSERT');
    });

    it('should update contact if metadata changed', () => {
      const { repo, mockDb } = setup();
      const existingContact = {
        id: 1,
        phone_number: '123@c.us',
        push_name: 'Old Name',
        display_name: 'Old Name',
        is_group: 0
      };

      mockDb.prepare.mock.mockImplementation((sql) => {
        if (sql.includes('SELECT * FROM contacts WHERE phone_number')) {
          return { get: mock.fn(() => existingContact) };
        }
        if (sql.includes('UPDATE contacts SET')) {
          return { run: mock.fn(() => ({ changes: 1 })) };
        }
        if (sql.includes('SELECT * FROM contacts WHERE id')) {
          return { get: mock.fn(() => ({ ...existingContact, push_name: 'New Name' })) };
        }
        return { get: mock.fn(), run: mock.fn() };
      });

      const result = repo.findOrCreateContact('123@c.us', {
        pushName: 'New Name', // Changed
        displayName: 'Old Name' // Same
      });

      assert.strictEqual(result.push_name, 'New Name');

      const calls = mockDb.prepare.mock.calls;
      const updateCalls = calls.filter(c => c.arguments[0].includes('UPDATE contacts SET'));

      assert.strictEqual(updateCalls.length, 1, 'Should call UPDATE');
      assert.ok(updateCalls[0].arguments[0].includes('push_name = ?'));
    });

    it('should insert new contact if not exists', () => {
      const { repo, mockDb } = setup();

      mockDb.prepare.mock.mockImplementation((sql) => {
        if (sql.includes('SELECT * FROM contacts WHERE phone_number')) {
          return { get: mock.fn(() => undefined) }; // Not found
        }
        if (sql.includes('INSERT INTO contacts') && sql.includes('ON CONFLICT')) {
          return {
            get: mock.fn(() => ({
              id: 2,
              phone_number: '456@c.us',
              push_name: 'New',
              display_name: 'New User'
            }))
          };
        }
        return { get: mock.fn(), run: mock.fn() };
      });

      const result = repo.findOrCreateContact('456@c.us', {
        pushName: 'New',
        displayName: 'New User'
      });

      assert.strictEqual(result.id, 2);

      const calls = mockDb.prepare.mock.calls;
      const insertCalls = calls.filter(c => c.arguments[0].includes('INSERT INTO contacts'));

      assert.strictEqual(insertCalls.length, 1, 'Should call INSERT');
    });
  });

  describe('updateContactStats', () => {
    it('should update last_seen_at for incoming messages', () => {
      const { repo, mockDb } = setup();

      mockDb.prepare.mock.mockImplementation(() => ({
        run: mock.fn()
      }));

      repo.updateContactStats(1, 'incoming');

      const calls = mockDb.prepare.mock.calls;
      const updateCall = calls.find(c => c.arguments[0].includes('UPDATE contacts'));

      assert.ok(updateCall);
      assert.ok(updateCall.arguments[0].includes('last_seen_at = ?'), 'Should update last_seen_at');
    });

    it('should update last_seen_at for outgoing messages', () => {
        const { repo, mockDb } = setup();

        mockDb.prepare.mock.mockImplementation(() => ({
          run: mock.fn()
        }));

        repo.updateContactStats(1, 'outgoing');

        const calls = mockDb.prepare.mock.calls;
        const updateCall = calls.find(c => c.arguments[0].includes('UPDATE contacts'));

        assert.ok(updateCall);
        assert.ok(updateCall.arguments[0].includes('last_seen_at = ?'), 'Should update last_seen_at');
      });
  });
});
