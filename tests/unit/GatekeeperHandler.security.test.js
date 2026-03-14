import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  it('should reject messages with body length exceeding 4096 characters', () => {
    const message = {
      from: 'user1@s.whatsapp.net',
      body: 'a'.repeat(4097)
    };
    assert.strictEqual(gatekeeper.shouldProcess(message), false);
  });

  it('should accept messages with body length exactly 4096 characters', () => {
    const message = {
      from: 'user1@s.whatsapp.net',
      body: 'a'.repeat(4096)
    };
    assert.strictEqual(gatekeeper.shouldProcess(message), true);
  });

  it('should gracefully accept messages without a body', () => {
    const message = {
      from: 'user1@s.whatsapp.net'
    };
    assert.strictEqual(gatekeeper.shouldProcess(message), true);
  });
});
