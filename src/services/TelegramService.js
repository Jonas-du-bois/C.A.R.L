import QRCode from 'qrcode';
import { escapeHtml } from '../utils/Sanitizer.js';

export class TelegramService {
  #botToken;
  #adminId;
  #allowedUserId;
  #pollingInterval = null;
  #lastUpdateId = 0;
  #commandHandlers = new Map();
  #callbackHandlers = new Map();
  #recentCommands = new Map();   // key: userId|messageId -> timestamp
  
  // ============================================
  // SESSION STATE - Pour workflow interactif
  // ============================================
  #pendingEvents = new Map();  // key: eventId -> { event, step, calendarId }
  #sessionCounter = 0;         // Compteur pour générer des IDs uniques

  constructor(config) {
    this.#botToken = config.telegram.botToken;
    this.#adminId = config.telegram.adminId;
    this.#allowedUserId = config.telegram.allowedUserId || config.telegram.adminId;
  }

  // ============================================
  // GESTION DES ÉVÉNEMENTS EN ATTENTE
  // ============================================

  /**
   * Stocke un événement en attente de confirmation
   * @param {Object} eventData - Données de l'événement
   * @returns {string} ID unique de l'événement en attente
   */
  storePendingEvent(eventData) {
    const eventId = `evt_${++this.#sessionCounter}`;
    this.#pendingEvents.set(eventId, {
      event: eventData,
      step: 'confirm',  // 'confirm', 'select_calendar', 'edit_date', 'edit_time', 'edit_title'
      calendarId: null,
      createdAt: Date.now()
    });
    
    // Nettoyer les anciens événements (> 1 heure)
    this.#cleanupOldPendingEvents();
    
    return eventId;
  }

  /**
   * Récupère un événement en attente
   * @param {string} eventId - ID de l'événement
   * @returns {Object|null} Données de l'événement ou null
   */
  getPendingEvent(eventId) {
    return this.#pendingEvents.get(eventId) || null;
  }

  /**
   * Met à jour un événement en attente
   * @param {string} eventId - ID de l'événement
   * @param {Object} updates - Propriétés à mettre à jour
   */
  updatePendingEvent(eventId, updates) {
    const pending = this.#pendingEvents.get(eventId);
    if (pending) {
      this.#pendingEvents.set(eventId, { ...pending, ...updates });
    }
  }

  /**
   * Supprime un événement en attente
   * @param {string} eventId - ID de l'événement
   */
  removePendingEvent(eventId) {
    this.#pendingEvents.delete(eventId);
  }

  /**
   * Trouve un événement en attente qui est en mode édition de titre
   * @returns {{ eventId: string, data: Object } | null}
   */
  findPendingEventAwaitingTitle() {
    for (const [eventId, data] of this.#pendingEvents) {
      if (data.step === 'edit_title') {
        return { eventId, data };
      }
    }
    return null;
  }

  /**
   * Nettoie les événements en attente de plus d'1 heure
   */
  #cleanupOldPendingEvents() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [eventId, data] of this.#pendingEvents) {
      if (data.createdAt < oneHourAgo) {
        this.#pendingEvents.delete(eventId);
      }
    }
  }

  /**
   * Start listening for commands via polling
   */
  startPolling() {
    if (!this.#botToken || !this.#adminId) return;
    
    // Éviter de démarrer le polling plusieurs fois
    if (this.#pollingInterval) {
      console.log('Telegram polling already running');
      return;
    }
    
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

  /**
   * Register a callback handler for inline buttons
   * @param {string} prefix - Callback data prefix (e.g., 'task_')
   * @param {Function} handler - Async function(callbackData, callbackQuery)
   */
  onCallback(prefix, handler) {
    this.#callbackHandlers.set(prefix, handler);
  }

  #isPolling = false;  // Flag pour éviter les appels concurrents

  async #pollUpdates() {
    // Éviter les appels concurrents au polling
    if (this.#isPolling) return;
    this.#isPolling = true;

    try {
      const url = `https://api.telegram.org/bot${this.#botToken}/getUpdates?offset=${this.#lastUpdateId + 1}&timeout=1`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.ok || !data.result?.length) {
        this.#isPolling = false;
        return;
      }

      // Mettre à jour lastUpdateId AVANT de traiter pour éviter les doublons
      const maxUpdateId = Math.max(...data.result.map(u => u.update_id));
      this.#lastUpdateId = maxUpdateId;

      for (const update of data.result) {
        await this.#handleUpdate(update);
      }
    } catch (error) {
      // Silently ignore polling errors
    } finally {
      this.#isPolling = false;
    }
  }

  async #handleUpdate(update) {
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      await this.#handleCallback(update.callback_query);
      return;
    }

    const message = update.message;
    if (!message?.text) return;

    // Ignorer les messages trop anciens (plus de 30 secondes)
    const messageAge = Date.now() / 1000 - message.date;
    if (messageAge > 30) {
      console.log(`[TelegramService] Ignoring old message (${Math.round(messageAge)}s old): ${message.text}`);
      return;
    }

    const userId = message.chat.id.toString();
    
    // Vérification stricte: seul l'utilisateur autorisé peut utiliser le bot
    if (userId !== this.#allowedUserId) {
      console.log(`[SECURITY] Unauthorized access attempt from user ID: ${userId}`);
      return;
    }

    const text = message.text.trim();
    
    // Protection anti-doublon: ignorer si le même message a été reçu récemment
    const commandKey = `${userId}|${message.message_id}`;
    if (this.#recentCommands.has(commandKey)) {
      console.log(`[TelegramService] Ignoring duplicate message ID: ${message.message_id}`);
      return;
    }
    this.#recentCommands.set(commandKey, Date.now());

    // Vérifier si on attend un nouveau titre pour un événement
    if (!text.startsWith('/')) {
      const pendingTitle = this.findPendingEventAwaitingTitle();
      if (pendingTitle) {
        // Appeler le handler de titre s'il est enregistré
        const titleHandler = this.#callbackHandlers.get('title_input_');
        if (titleHandler) {
          await titleHandler(text, pendingTitle.eventId);
        }
        return;
      }
      // Si ce n'est pas une commande et pas d'attente de titre, ignorer
      return;
    }

    const [command, ...args] = text.slice(1).split(' ');
    this.#recentCommands.set(commandKey, Date.now());
    
    // Nettoyer les anciennes entrées (> 60 secondes)
    const now = Date.now();
    for (const [key, ts] of this.#recentCommands) {
      if (now - ts > 60000) {
        this.#recentCommands.delete(key);
      }
    }

    const handler = this.#commandHandlers.get(command.toLowerCase());

    if (handler) {
      try {
        await handler(args, message);
      } catch (error) {
        await this.sendMessage(`❌ Erreur: ${escapeHtml(error.message)}`);
      }
    } else {
      await this.sendMessage(
        `❓ Commande inconnue: /${escapeHtml(command)}\n\n` +
        `<b>Commandes disponibles:</b>\n` +
        `/connect - 📱 Obtenir le QR code WhatsApp\n` +
        `/status - 🤖 État du système\n` +
        `/rapport - 📊 Rapport des dernières 24h\n` +
        `/stats - 📈 Statistiques rapides\n` +
        `/tasks - ✅ Voir les tâches à planifier\n` +
        `/reset - 🔄 Réinitialiser la session WhatsApp`
      );
    }
  }

  async #handleCallback(callbackQuery) {
    const userId = callbackQuery.from.id.toString();
    
    // Vérification de sécurité
    if (userId !== this.#allowedUserId) {
      console.log(`[SECURITY] Unauthorized callback from user ID: ${userId}`);
      return;
    }

    const data = callbackQuery.data;
    
    // Trouver le handler correspondant
    for (const [prefix, handler] of this.#callbackHandlers) {
      if (data.startsWith(prefix)) {
        try {
          await handler(data, callbackQuery);
          // Répondre au callback pour enlever le "loading"
          await this.answerCallback(callbackQuery.id);
        } catch (error) {
          await this.answerCallback(callbackQuery.id, `❌ ${error.message}`);
        }
        return;
      }
    }
  }

  /**
   * Answer a callback query
   */
  async answerCallback(callbackQueryId, text = null) {
    try {
      const url = `https://api.telegram.org/bot${this.#botToken}/answerCallbackQuery`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text,
          show_alert: !!text
        })
      });
    } catch (error) {
      console.error('Failed to answer callback:', error);
    }
  }

  async sendMessage(message, options = {}) {
    if (!this.#botToken || !this.#adminId) return;

    // Telegram limite les messages à 4096 caractères
    const MAX_LENGTH = 4000; // Marge de sécurité
    
    // Si le message est trop long, le découper en parties
    if (message.length > MAX_LENGTH) {
      const parts = this.#splitMessage(message, MAX_LENGTH);
      for (let i = 0; i < parts.length; i++) {
        const partOptions = i === parts.length - 1 ? options : {}; // Boutons seulement sur le dernier message
        await this.#sendSingleMessage(parts[i], partOptions);
        // Petite pause entre les messages pour éviter le rate limiting
        if (i < parts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      return;
    }

    await this.#sendSingleMessage(message, options);
  }

  /**
   * Découpe un message long en parties respectant la limite Telegram
   * Essaie de couper aux sauts de ligne pour garder la lisibilité
   */
  #splitMessage(message, maxLength) {
    const parts = [];
    let remaining = message;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        parts.push(remaining);
        break;
      }

      // Chercher le dernier saut de ligne avant la limite
      let cutIndex = remaining.lastIndexOf('\n', maxLength);
      
      // Si pas de saut de ligne trouvé, chercher un espace
      if (cutIndex === -1 || cutIndex < maxLength * 0.5) {
        cutIndex = remaining.lastIndexOf(' ', maxLength);
      }
      
      // En dernier recours, couper brutalement
      if (cutIndex === -1 || cutIndex < maxLength * 0.5) {
        cutIndex = maxLength;
      }

      parts.push(remaining.substring(0, cutIndex));
      remaining = remaining.substring(cutIndex).trimStart();
    }

    // Ajouter un indicateur de partie si plusieurs messages
    if (parts.length > 1) {
      return parts.map((part, i) => `📄 (${i + 1}/${parts.length})\n\n${part}`);
    }

    return parts;
  }

  async #sendSingleMessage(message, options = {}) {
    try {
      const url = `https://api.telegram.org/bot${this.#botToken}/sendMessage`;
      const body = {
        chat_id: this.#adminId,
        text: message,
        parse_mode: 'HTML'
      };

      // Ajouter les boutons inline si fournis
      if (options.inlineKeyboard) {
        body.reply_markup = {
          inline_keyboard: options.inlineKeyboard
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
