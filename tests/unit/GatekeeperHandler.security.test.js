import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security Tests', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  describe('shouldProcess - Payload Size', () => {
    it('should reject messages with body length > 4096 characters (DoS prevention)', () => {
      const longMessage = {
        from: 'attacker@s.whatsapp.net',
        body: 'a'.repeat(4097) // One char over limit
      };

      const result = gatekeeper.shouldProcess(longMessage);
      assert.strictEqual(result, false, 'Should reject massive payload');
    });

    it('should accept messages with body length <= 4096 characters', () => {
      const normalMessage = {
        from: 'user@s.whatsapp.net',
        body: 'a'.repeat(4096) // Exact limit
      };

      const result = gatekeeper.shouldProcess(normalMessage);
      assert.strictEqual(result, true, 'Should accept valid payload');
    });

    it('should handle messages without body gracefully (backward compatibility)', () => {
      const noBodyMessage = {
        from: 'system@s.whatsapp.net'
      };

      const result = gatekeeper.shouldProcess(noBodyMessage);
      assert.strictEqual(result, true, 'Should not crash on missing body');
    });
  });
});
