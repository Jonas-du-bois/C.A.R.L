import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security Tests', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  it('should accept messages with body length within limits', () => {
    const message = {
      from: 'user1@s.whatsapp.net',
      body: 'Hello, this is a normal message.'
    };
    assert.strictEqual(gatekeeper.shouldProcess(message), true);
  });

  it('should reject messages with body length exceeding 4096 characters', () => {
    const longBody = 'a'.repeat(4097);
    const message = {
      from: 'user2@s.whatsapp.net',
      body: longBody
    };
    assert.strictEqual(gatekeeper.shouldProcess(message), false);
  });

  it('should accept messages with body length exactly 4096 characters', () => {
    const longBody = 'a'.repeat(4096);
    const message = {
      from: 'user3@s.whatsapp.net',
      body: longBody
    };
    assert.strictEqual(gatekeeper.shouldProcess(message), true);
  });

  it('should handle messages without a body property gracefully', () => {
    const message = {
      from: 'user4@s.whatsapp.net'
    };
    // Should pass rate limiting checks if first message
    assert.strictEqual(gatekeeper.shouldProcess(message), true);
  });

  it('should prioritize payload size check over rate limiting', () => {
    const longBody = 'a'.repeat(5000);
    const message = {
      from: 'user5@s.whatsapp.net',
      body: longBody
    };

    // First message - would pass rate limit but fail size check
    assert.strictEqual(gatekeeper.shouldProcess(message), false);

    // Second message immediately after - still fails size check (and rate limit irrelevant)
    assert.strictEqual(gatekeeper.shouldProcess(message), false);
  });
});
