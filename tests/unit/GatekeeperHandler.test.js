import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GatekeeperHandler } from '../../src/handlers/GatekeeperHandler.js';

describe('GatekeeperHandler', () => {
  let gatekeeper;

  beforeEach(() => {
    gatekeeper = new GatekeeperHandler();
  });

  describe('shouldProcess', () => {
    it('should allow first message from a sender', () => {
      const message = { from: 'user1@s.whatsapp.net' };
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should allow messages with 2+ seconds between them', async () => {
      const message = { from: 'user1@s.whatsapp.net' };
      
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
      
      // Wait 2.1 seconds
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      assert.strictEqual(gatekeeper.shouldProcess(message), true);
    });

    it('should block messages sent within 2 seconds', () => {
      const message = { from: 'user1@s.whatsapp.net' };
      
      gatekeeper.shouldProcess(message);
      // Immediate second message should be blocked
      assert.strictEqual(gatekeeper.shouldProcess(message), false);
    });

    it('should track different users separately', () => {
      const user1 = { from: 'user1@s.whatsapp.net' };
      const user2 = { from: 'user2@s.whatsapp.net' };
      
      // First message from each user should be allowed
      assert.strictEqual(gatekeeper.shouldProcess(user1), true);
      assert.strictEqual(gatekeeper.shouldProcess(user2), true);
      
      // Immediate second message from each should be blocked
      assert.strictEqual(gatekeeper.shouldProcess(user1), false);
      assert.strictEqual(gatekeeper.shouldProcess(user2), false);
    });

    it('should block when rate limit of 5 messages per minute is exceeded', async () => {
      const message = { from: 'user1@s.whatsapp.net' };
      
      // Simulate 5 allowed messages with proper spacing
      for (let i = 0; i < 5; i++) {
        // Wait 2.1 seconds between messages (except first)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2100));
        }
        assert.strictEqual(gatekeeper.shouldProcess(message), true, `Message ${i + 1} should be allowed`);
      }
      
      // Wait 2.1 seconds before the 6th message
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      // 6th message should be blocked due to rate limit
      assert.strictEqual(gatekeeper.shouldProcess(message), false, 'Message 6 should be blocked');
    });
  });

  describe('cleanup', () => {
    it('should remove users with no recent messages', () => {
      let currentTime = 1000000;
      const mockNow = () => currentTime;

      const handler = new GatekeeperHandler({ now: mockNow });
      const user1 = { from: 'user1@s.whatsapp.net' };

      // User sends a message
      handler.shouldProcess(user1);
      assert.strictEqual(handler.getStats().userCount, 1);

      // Advance time by 61 seconds
      currentTime += 61000;

      // Run cleanup
      handler.cleanup();

      // User should be removed
      assert.strictEqual(handler.getStats().userCount, 0);
    });

    it('should keep users with recent messages', () => {
      let currentTime = 1000000;
      const mockNow = () => currentTime;

      const handler = new GatekeeperHandler({ now: mockNow });
      const user1 = { from: 'user1@s.whatsapp.net' };

      // User sends a message
      handler.shouldProcess(user1);

      // Advance time by 30 seconds
      currentTime += 30000;

      // Run cleanup
      handler.cleanup();

      // User should still be there
      assert.strictEqual(handler.getStats().userCount, 1);
    });

    it('should partially clean up old timestamps for active users', () => {
      let currentTime = 1000000;
      const mockNow = () => currentTime;

      const handler = new GatekeeperHandler({ now: mockNow });
      const user1 = { from: 'user1@s.whatsapp.net' };

      // Message 1 at T=0
      handler.shouldProcess(user1);

      // Message 2 at T=30s
      currentTime += 30000;
      handler.shouldProcess(user1);

      // Advance time to T=70s (Message 1 is old, Message 2 is recent)
      currentTime = 1000000 + 70000;

      // Run cleanup
      handler.cleanup();

      // User should still be there (Message 2 is recent)
      assert.strictEqual(handler.getStats().userCount, 1);

      // Advance to T=95s (Message 2 is now also old: 95s - 30s = 65s age)
      currentTime = 1000000 + 95000;

      handler.cleanup();
      assert.strictEqual(handler.getStats().userCount, 0);
    });
  });
});
