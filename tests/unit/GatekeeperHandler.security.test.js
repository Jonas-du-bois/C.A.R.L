import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler Security', () => {
  it('should reject messages with body longer than 4096 characters', () => {
    const handler = new GatekeeperHandler();
    const longBody = 'A'.repeat(4097);
    const message = { from: 'user1@s.whatsapp.net', body: longBody };

    assert.strictEqual(handler.shouldProcess(message), false, 'Message with body > 4096 should be rejected');
  });

  it('should allow messages with body length exactly 4096 characters', () => {
    const handler = new GatekeeperHandler();
    const longBody = 'A'.repeat(4096);
    const message = { from: 'user1@s.whatsapp.net', body: longBody };

    assert.strictEqual(handler.shouldProcess(message), true, 'Message with body == 4096 should be allowed');
  });

  it('should allow messages without a body', () => {
    const handler = new GatekeeperHandler();
    const message = { from: 'user1@s.whatsapp.net' };

    assert.strictEqual(handler.shouldProcess(message), true, 'Message without body should be allowed');
  });
});
