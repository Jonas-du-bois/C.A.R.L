import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler (Security)', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  describe('Denial of Service (DoS) Protections', () => {
    it('should reject messages with excessively long bodies', () => {
      const message = {
        from: 'user1@s.whatsapp.net',
        body: 'a'.repeat(4097) // Just over the limit
      };

      assert.strictEqual(gatekeeper.shouldProcess(message), false, 'Message should be rejected due to length limit');
    });

    it('should allow messages just under the length limit', () => {
      const message = {
        from: 'user1@s.whatsapp.net',
        body: 'a'.repeat(4096) // Exactly at the limit
      };

      assert.strictEqual(gatekeeper.shouldProcess(message), true, 'Message should be allowed within length limit');
    });

    it('should allow messages without a body property', () => {
      const message = {
        from: 'user1@s.whatsapp.net' // e.g., media message without caption
      };

      assert.strictEqual(gatekeeper.shouldProcess(message), true, 'Message without body should be processed');
    });
  });
});
