import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security Tests', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  describe('shouldProcess DoS Protection', () => {
    it('should allow messages with body length exactly at the 4096 limit', () => {
      const message = {
        from: 'user@s.whatsapp.net',
        body: 'a'.repeat(4096)
      };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should reject messages with body length exceeding 4096 limit', () => {
      const message = {
        from: 'user@s.whatsapp.net',
        body: 'a'.repeat(4097)
      };
      assert.strictEqual(gatekeeper.shouldProcess(message), false);
    });

    it('should allow messages without a body property gracefully', () => {
      const message = {
        from: 'user@s.whatsapp.net'
        // no body property
      };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should allow messages with an empty string body', () => {
      const message = {
        from: 'user@s.whatsapp.net',
        body: ''
      };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });
  });
});
