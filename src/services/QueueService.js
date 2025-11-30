import PQueue from 'p-queue';

export class QueueService {
  #queues = new Map();
  #globalQueue;

  constructor(options = {}) {
    this.#globalQueue = new PQueue({
      concurrency: options.concurrency || 3,
      interval: options.interval || 1000,
      intervalCap: options.intervalCap || 5
    });
  }

  /**
   * Get or create a queue for a specific sender
   * Ensures messages from the same sender are processed sequentially
   */
  #getSenderQueue(senderId) {
    if (!this.#queues.has(senderId)) {
      this.#queues.set(senderId, new PQueue({ concurrency: 1 }));
    }
    return this.#queues.get(senderId);
  }

  /**
   * Enqueue a task for a specific sender
   * Messages from the same sender are processed one at a time
   */
  async enqueue(senderId, task) {
    const senderQueue = this.#getSenderQueue(senderId);
    return this.#globalQueue.add(() => senderQueue.add(task));
  }

  /**
   * Enqueue a task without sender-specific ordering
   */
  async enqueueGlobal(task) {
    return this.#globalQueue.add(task);
  }

  /**
   * Wait for all pending tasks to complete
   */
  async onIdle() {
    await this.#globalQueue.onIdle();
    for (const queue of this.#queues.values()) {
      await queue.onIdle();
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      globalPending: this.#globalQueue.pending,
      globalSize: this.#globalQueue.size,
      senderQueues: this.#queues.size
    };
  }

  /**
   * Clear old sender queues to prevent memory leaks
   */
  cleanup() {
    for (const [senderId, queue] of this.#queues.entries()) {
      if (queue.size === 0 && queue.pending === 0) {
        this.#queues.delete(senderId);
      }
    }
  }
}
