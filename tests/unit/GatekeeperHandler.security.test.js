import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security Tests', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  describe('Payload Length Limits', () => {
    it('should allow messages without a body', () => {
      const message = { from: 'user1@s.whatsapp.net' };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should allow messages with a short body', () => {
      const message = { from: 'user2@s.whatsapp.net', body: 'Hello, world!' };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should allow messages with exactly 4096 characters', () => {
      const longBody = 'A'.repeat(4096);
      const message = { from: 'user3@s.whatsapp.net', body: longBody };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should block messages with more than 4096 characters', () => {
      const extremelyLongBody = 'B'.repeat(4097);
      const message = { from: 'user4@s.whatsapp.net', body: extremelyLongBody };
      assert.strictEqual(gatekeeper.shouldProcess(message), false);
    });
  });
});
