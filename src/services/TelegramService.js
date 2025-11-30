export class TelegramService {
  #botToken;
  #adminId;

  constructor(config) {
    this.#botToken = config.telegram.botToken;
    this.#adminId = config.telegram.adminId;
  }

  async sendMessage(message) {
    if (!this.#botToken || !this.#adminId) return;

    try {
      // Using native fetch to avoid adding 'node-fetch' or 'telegraf' as extra dependency
      // if not needed, but since we are in Node 18+, fetch is global.
      const url = `https://api.telegram.org/bot${this.#botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.#adminId,
          text: message
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Telegram API Error:', error);
      }
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
    }
  }
}
