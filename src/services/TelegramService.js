import QRCode from 'qrcode';

export class TelegramService {
  #botToken;
  #adminId;
  #allowedUserId;
  #pollingInterval = null;
  #lastUpdateId = 0;
  #commandHandlers = new Map();

  constructor(config) {
    this.#botToken = config.telegram.botToken;
    this.#adminId = config.telegram.adminId;
    this.#allowedUserId = config.telegram.allowedUserId || config.telegram.adminId;
  }

  /**
   * Start listening for commands via polling
   */
  startPolling() {
    if (!this.#botToken || !this.#adminId) return;
    
    this.#pollingInterval = setInterval(() => this.#pollUpdates(), 3000);
    console.log('Telegram bot polling started');
  }

  stopPolling() {
    if (this.#pollingInterval) {
      clearInterval(this.#pollingInterval);
      this.#pollingInterval = null;
    }
  }

  /**
   * Register a command handler
   * @param {string} command - Command without slash (e.g., 'rapport')
   * @param {Function} handler - Async function to handle the command
   */
  onCommand(command, handler) {
    this.#commandHandlers.set(command.toLowerCase(), handler);
  }

  async #pollUpdates() {
    try {
      const url = `https://api.telegram.org/bot${this.#botToken}/getUpdates?offset=${this.#lastUpdateId + 1}&timeout=1`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.ok || !data.result?.length) return;

      for (const update of data.result) {
        this.#lastUpdateId = update.update_id;
        await this.#handleUpdate(update);
      }
    } catch (error) {
      // Silently ignore polling errors
    }
  }

  async #handleUpdate(update) {
    const message = update.message;
    if (!message?.text) return;

    const userId = message.chat.id.toString();
    
    // Vérification stricte: seul l'utilisateur autorisé peut utiliser le bot
    if (userId !== this.#allowedUserId) {
      console.log(`[SECURITY] Unauthorized access attempt from user ID: ${userId}`);
      // Ne pas répondre aux utilisateurs non autorisés (silencieux)
      return;
    }

    const text = message.text.trim();
    if (!text.startsWith('/')) return;

    const [command, ...args] = text.slice(1).split(' ');
    const handler = this.#commandHandlers.get(command.toLowerCase());

    if (handler) {
      try {
        await handler(args, message);
      } catch (error) {
        await this.sendMessage(`❌ Erreur: ${error.message}`);
      }
    } else {
      await this.sendMessage(
        `❓ Commande inconnue: /${command}\n\n` +
        `<b>Commandes disponibles:</b>\n` +
        `/connect - 📱 Obtenir le QR code WhatsApp\n` +
        `/status - 🤖 État du système\n` +
        `/rapport - 📊 Rapport des dernières 24h\n` +
        `/stats - 📈 Statistiques rapides\n` +
        `/reset - 🔄 Réinitialiser la session WhatsApp`
      );
    }
  }

  async sendMessage(message) {
    if (!this.#botToken || !this.#adminId) return;

    try {
      const url = `https://api.telegram.org/bot${this.#botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.#adminId,
          text: message,
          parse_mode: 'HTML'
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

  async sendQRCode(qrData) {
    if (!this.#botToken || !this.#adminId) return;

    try {
      // Generate QR code as base64 PNG
      const qrImageBuffer = await QRCode.toBuffer(qrData, {
        type: 'png',
        width: 300,
        margin: 2
      });

      // Create form data for sending photo
      const formData = new FormData();
      formData.append('chat_id', this.#adminId);
      formData.append('caption', '🔐 Scannez ce QR code avec WhatsApp pour connecter C.A.R.L.\n\nWhatsApp → Appareils connectés → Connecter un appareil');
      formData.append('photo', new Blob([qrImageBuffer], { type: 'image/png' }), 'qrcode.png');

      const url = `https://api.telegram.org/bot${this.#botToken}/sendPhoto`;
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Telegram API Error (QR):', error);
      } else {
        console.log('QR Code sent to Telegram successfully');
      }
    } catch (error) {
      console.error('Failed to send QR code to Telegram:', error);
    }
  }
}
