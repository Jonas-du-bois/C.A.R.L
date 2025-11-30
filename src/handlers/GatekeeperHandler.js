export class GatekeeperHandler {
  #userTimestamps = new Map();

  shouldProcess(message) {
    const now = Date.now();
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
}
