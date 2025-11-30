import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { QueueService } from '../../src/services/QueueService.js';

describe('QueueService', () => {
  let queueService;

  beforeEach(() => {
    queueService = new QueueService({ concurrency: 2 });
  });

  describe('enqueue', () => {
    it('should execute a task', async () => {
      let executed = false;
      await queueService.enqueue('sender1', async () => {
        executed = true;
      });
      assert.strictEqual(executed, true);
    });

    it('should return task result', async () => {
      const result = await queueService.enqueue('sender1', async () => {
        return 'result';
      });
      assert.strictEqual(result, 'result');
    });

    it('should process tasks from same sender sequentially', async () => {
      const order = [];
      
      const task1 = queueService.enqueue('sender1', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        order.push(1);
      });
      
      const task2 = queueService.enqueue('sender1', async () => {
        order.push(2);
      });
      
      await Promise.all([task1, task2]);
      
      assert.deepStrictEqual(order, [1, 2]);
    });

    it('should process tasks from different senders in parallel', async () => {
      const startTimes = {};
      
      const task1 = queueService.enqueue('sender1', async () => {
        startTimes.sender1 = Date.now();
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      const task2 = queueService.enqueue('sender2', async () => {
        startTimes.sender2 = Date.now();
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      await Promise.all([task1, task2]);
      
      // Both tasks should start within a small time window (parallel execution)
      const timeDiff = Math.abs(startTimes.sender1 - startTimes.sender2);
      assert.ok(timeDiff < 50, 'Tasks from different senders should run in parallel');
    });
  });

  describe('enqueueGlobal', () => {
    it('should execute a global task', async () => {
      let executed = false;
      await queueService.enqueueGlobal(async () => {
        executed = true;
      });
      assert.strictEqual(executed, true);
    });
  });

  describe('onIdle', () => {
    it('should resolve when all tasks are complete', async () => {
      let count = 0;
      
      queueService.enqueue('sender1', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        count++;
      });
      
      queueService.enqueue('sender2', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        count++;
      });
      
      await queueService.onIdle();
      
      assert.strictEqual(count, 2);
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', () => {
      const stats = queueService.getStats();
      
      assert.ok('globalPending' in stats);
      assert.ok('globalSize' in stats);
      assert.ok('senderQueues' in stats);
    });
  });

  describe('cleanup', () => {
    it('should remove empty sender queues', async () => {
      await queueService.enqueue('sender1', async () => {});
      await queueService.enqueue('sender2', async () => {});
      
      await queueService.onIdle();
      
      const statsBefore = queueService.getStats();
      assert.strictEqual(statsBefore.senderQueues, 2);
      
      queueService.cleanup();
      
      const statsAfter = queueService.getStats();
      assert.strictEqual(statsAfter.senderQueues, 0);
    });
  });
});
