import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler DoS Protection', () => {
  it('should block massive messages (>4096 chars)', () => {
    const gatekeeper = new GatekeeperHandler();
    // Create a 1MB message
    const hugeBody = 'a'.repeat(1024 * 1024);
    const message = {
      from: 'attacker@s.whatsapp.net',
      body: hugeBody
    };

    // Should return false (blocked)
    assert.strictEqual(gatekeeper.shouldProcess(message), false, 'Security: Large message was not blocked');
  });

  it('should allow messages exactly 4096 chars', () => {
    const gatekeeper = new GatekeeperHandler();
    const message = {
      from: 'user1@s.whatsapp.net',
      body: 'a'.repeat(4096)
    };

    assert.strictEqual(gatekeeper.shouldProcess(message), true);
  });

  it('should block messages with 4097 chars', () => {
    const gatekeeper = new GatekeeperHandler();
    const message = {
      from: 'user2@s.whatsapp.net',
      body: 'a'.repeat(4097)
    };

    assert.strictEqual(gatekeeper.shouldProcess(message), false);
  });

  it('should allow messages without body (e.g. status/media)', () => {
    const gatekeeper = new GatekeeperHandler();
    const message = {
      from: 'user3@s.whatsapp.net'
      // no body
    };

    assert.strictEqual(gatekeeper.shouldProcess(message), true);
  });
});
