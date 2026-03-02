import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security Tests', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  describe('shouldProcess payload limit', () => {
    it('should allow messages with body length exactly 4096 characters', () => {
      const message = {
        from: 'user1@s.whatsapp.net',
        body: 'a'.repeat(4096)
      };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should allow messages with body length less than 4096 characters', () => {
      const message = {
        from: 'user1@s.whatsapp.net',
        body: 'a'.repeat(100)
      };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should block messages with body length exceeding 4096 characters', () => {
      const message = {
        from: 'user1@s.whatsapp.net',
        body: 'a'.repeat(4097)
      };
      assert.strictEqual(gatekeeper.shouldProcess(message), false);
    });

    it('should allow messages without a body property', () => {
      const message = {
        from: 'user1@s.whatsapp.net'
      };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should allow messages where body is not a string', () => {
      const message = {
        from: 'user1@s.whatsapp.net',
        body: { type: 'image' } // Example of non-string body
      };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });
  });
});
