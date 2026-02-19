export class GatekeeperHandler {
  #userTimestamps = new Map();
  #now;

  constructor(options = {}) {
    this.#now = options.now || Date.now;

    // Cleanup every 5 minutes (default) or custom interval
    // Use unref() so this interval doesn't prevent the process from exiting
    const interval = options.cleanupInterval || 5 * 60 * 1000;
    setInterval(() => this.cleanup(), interval).unref();
  }

  shouldProcess(message) {
    // Rule 0: Max body length 4096 characters (DoS protection)
    if (message.body && message.body.length > 4096) {
      return false;
    }

    const now = this.#now();
    const timestamps = this.#userTimestamps.get(message.from) || [];

    // Filter timestamps older than 1 minute
    const recentTimestamps = timestamps.filter(t => now - t < 60000);

    // Rule 1: Max 5 messages per minute
    if (recentTimestamps.length >= 5) {
      return false;
    }

    // Rule 2: Min 2 seconds between messages
    if (recentTimestamps.length > 0) {
      const lastTimestamp = recentTimestamps[recentTimestamps.length - 1];
      if (now - lastTimestamp < 2000) {
        return false;
      }
    }

    recentTimestamps.push(now);
    this.#userTimestamps.set(message.from, recentTimestamps);
    return true;
  }

  /**
   * Remove old user entries to prevent memory leaks (DoS protection)
   */
  cleanup() {
    const now = this.#now();
    for (const [user, timestamps] of this.#userTimestamps.entries()) {
      // Keep only timestamps within the last minute
      const recent = timestamps.filter(t => now - t < 60000);

      if (recent.length === 0) {
        this.#userTimestamps.delete(user);
      } else if (recent.length < timestamps.length) {
        // Optimization: update with trimmed array if some were removed
        this.#userTimestamps.set(user, recent);
      }
    }
  }

  getStats() {
    return {
      userCount: this.#userTimestamps.size
    };
  }
}
