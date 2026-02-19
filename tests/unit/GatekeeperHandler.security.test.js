import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  it('should block messages exceeding 4096 characters', () => {
    const longBody = 'a'.repeat(4097);
    const message = {
      from: 'attacker@s.whatsapp.net',
      body: longBody
    };

    assert.strictEqual(gatekeeper.shouldProcess(message), false);
  });

  it('should allow messages with 4096 characters', () => {
    const maxBody = 'a'.repeat(4096);
    const message = {
      from: 'user@s.whatsapp.net',
      body: maxBody
    };

    assert.strictEqual(gatekeeper.shouldProcess(message), true);
  });

  it('should handle messages without body (e.g. media)', () => {
    const message = {
      from: 'user@s.whatsapp.net'
      // no body
    };

    // Should pass length check (undefined length is not > 4096)
    // Should be processed if rate limits allow
    assert.strictEqual(gatekeeper.shouldProcess(message), true);
  });
});
