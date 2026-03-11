import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security Tests', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  describe('shouldProcess payload size limits (DoS protection)', () => {
    it('should reject messages with body length > 4096 characters', () => {
      const massivePayload = 'A'.repeat(4097);
      const message = {
        from: 'attacker@s.whatsapp.net',
        body: massivePayload
      };

      // Should fail immediately before even tracking the user
      assert.strictEqual(gatekeeper.shouldProcess(message), false);

      // User should not be tracked for failed attempts
      const stats = gatekeeper.getStats();
      assert.strictEqual(stats.userCount, 0);
    });

    it('should accept messages with body length exactly 4096 characters', () => {
      const maxPayload = 'B'.repeat(4096);
      const message = {
        from: 'user1@s.whatsapp.net',
        body: maxPayload
      };

      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should accept messages without a body for backward compatibility', () => {
      const message = {
        from: 'user2@s.whatsapp.net'
      };

      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });
  });
});
