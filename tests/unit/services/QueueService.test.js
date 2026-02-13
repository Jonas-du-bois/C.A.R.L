
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { QueueService } from '../../../src/services/QueueService.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('QueueService', () => {
  let queue;

  beforeEach(() => {
    queue = new QueueService({ concurrency: 3 });
  });

  afterEach(() => {
    // Optional cleanup
  });

  test('should process tasks sequentially for the same sender', async () => {
    const events = [];
    const task1 = () => sleep(50).then(() => events.push(1));
    const task2 = () => sleep(10).then(() => events.push(2));

    queue.enqueue('user1', task1);
    queue.enqueue('user1', task2);

    await queue.onIdle();

    assert.deepStrictEqual(events, [1, 2]);
  });

  test('should process tasks concurrently for different senders', async () => {
    const events = [];
    const task1 = () => sleep(50).then(() => events.push('user1'));
    const task2 = () => sleep(10).then(() => events.push('user2'));

    queue.enqueue('user1', task1);
    queue.enqueue('user2', task2);

    await queue.onIdle();

    assert.deepStrictEqual(events, ['user2', 'user1']);
  });

  test('should not block global queue with one spammer (Head-of-Line Blocking)', async () => {
    const events = [];
    const slowTask = (id) => sleep(100).then(() => events.push(id));
    const fastTask = (id) => sleep(10).then(() => events.push(id));

    // User1 spams 3 slow tasks
    queue.enqueue('user1', () => slowTask('A1'));
    queue.enqueue('user1', () => slowTask('A2'));
    queue.enqueue('user1', () => slowTask('A3'));

    await sleep(5); // Ensure they are enqueued

    // User2 sends fast task
    queue.enqueue('user2', () => fastTask('B1'));

    await queue.onIdle();

    // With optimization: B1 should finish before A1 (because 10ms < 100ms)
    // Without optimization: B1 finishes after A1 (because it waits for slot)

    const b1Index = events.indexOf('B1');
    const a1Index = events.indexOf('A1');

    assert.ok(b1Index < a1Index, `B1 (${b1Index}) should finish before A1 (${a1Index})`);
  });

  test('should clean up empty queues', async () => {
    queue.enqueue('user1', async () => {});
    await queue.onIdle();

    queue.cleanup();

    const stats = queue.getStats();
    assert.strictEqual(stats.senderQueues, 0);
  });
});
