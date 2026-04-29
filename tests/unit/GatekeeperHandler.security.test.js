import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  describe('Payload Size Limit', () => {
    it('should allow a message with a body under the 4096 character limit', () => {
      const message = { from: 'user1@s.whatsapp.net', body: 'a'.repeat(4096) };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should block a message with a body exceeding the 4096 character limit', () => {
      const message = { from: 'user2@s.whatsapp.net', body: 'a'.repeat(4097) };
      assert.strictEqual(gatekeeper.shouldProcess(message), false);
    });

    it('should allow a message without a body property', () => {
      const message = { from: 'user3@s.whatsapp.net' };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });
  });
});
