import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

export class WhatsAppService extends EventEmitter {
  #client;
  #config;
  #isReady = false;
  #qrCount = 0;
  #loadingTimeout = null;
  #lastLoadingPercent = 0;
  #loadingStuckCount = 0;
  #sessionPath;
  #currentQr = null;  // Stocke le dernier QR code
  #qrRequested = false;  // QR demandé via /connect
  #autoSendQr = false;  // Envoyer automatiquement le QR après réinitialisation

  constructor(config) {
    super();
    this.#config = config;
    this.#sessionPath = process.env.WHATSAPP_SESSION_PATH || './data/.wwebjs_auth';
    this.#initClient();
  }

  #initClient() {
    this.#client = new Client({
      authStrategy: new LocalAuth({
        clientId: "carl-client",
        dataPath: this.#sessionPath
      }),
      puppeteer: {
        headless: true,
        args: this.#config.whatsapp?.puppeteer?.args || [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync'
        ]
      }
    });

    this.#setupEventHandlers();
  }

  #setupEventHandlers() {
    this.#client.on('qr', (qr) => {
      this.#qrCount++;
      this.#currentQr = qr;  // Toujours stocker le dernier QR
      
      // Envoyer automatiquement le premier QR après réinitialisation, ou si demandé via /connect
      if (this.#autoSendQr || this.#qrRequested) {
        console.log(`[WhatsApp] QR Code #${this.#qrCount} envoyé sur Telegram`);
        this.#autoSendQr = false;  // Reset après envoi
        this.#qrRequested = false;
        this.emit('qr', qr);
      } else {
        console.log(`[WhatsApp] QR Code #${this.#qrCount} prêt - utilisez /connect sur Telegram`);
      }
    });

    this.#client.on('ready', () => {
      console.log(`[WhatsApp] Ready event received (was ready: ${this.#isReady})`);
      if (!this.#isReady) {
        this.#isReady = true;
        this.#qrCount = 0;
        this.#currentQr = null;  // Plus besoin du QR
        this.emit('ready');
      } else {
        console.log(`[WhatsApp] Ignoring duplicate ready event`);
      }
    });

    this.#client.on('message', (msg) => this.emit('message', msg));
    this.#client.on('message_create', (msg) => this.emit('message_create', msg));
    
    this.#client.on('disconnected', (reason) => {
      console.log(`[WhatsApp] Disconnected: ${reason}`);
      this.#isReady = false;
      this.#qrCount = 0; // Reset QR count
      this.emit('disconnected', reason);
    });

    this.#client.on('auth_failure', (msg) => {
      console.log(`[WhatsApp] Auth failure: ${msg}`);
      this.emit('auth_failure', msg);
    });

    this.#client.on('authenticated', () => {
      console.log(`[WhatsApp] Authenticated successfully`);
    });

    this.#client.on('loading_screen', (percent, message) => {
      console.log(`[WhatsApp] Loading: ${percent}% - ${message}`);
      
      // Détection du blocage à 99%
      if (percent === this.#lastLoadingPercent && percent >= 95) {
        this.#loadingStuckCount++;
        if (this.#loadingStuckCount >= 3) {
          console.log(`[WhatsApp] ⚠️ Stuck at ${percent}% - session may be corrupted`);
          this.emit('loading_stuck', percent);
        }
      } else {
        this.#loadingStuckCount = 0;
      }
      this.#lastLoadingPercent = percent;
      
      // Reset du timeout à chaque progression
      this.#resetLoadingTimeout();
    });
  }

  #resetLoadingTimeout() {
    if (this.#loadingTimeout) {
      clearTimeout(this.#loadingTimeout);
    }
    
    // Si pas ready après 2 minutes de loading, considérer comme bloqué
    this.#loadingTimeout = setTimeout(() => {
      if (!this.#isReady && this.#lastLoadingPercent >= 95) {
        console.log(`[WhatsApp] ⚠️ Loading timeout at ${this.#lastLoadingPercent}% - session corrupted`);
        this.emit('loading_stuck', this.#lastLoadingPercent);
      }
    }, 120000); // 2 minutes
  }

  /**
   * Supprime la session corrompue pour forcer un nouveau QR code
   */
  async clearSession() {
    console.log(`[WhatsApp] Clearing corrupted session...`);
    
    try {
      // Détruire le client actuel
      if (this.#client) {
        try {
          await this.#client.destroy();
        } catch (e) {
          // Ignorer les erreurs de destruction
        }
      }
      
      // Supprimer le dossier de session
      const sessionDir = path.resolve(this.#sessionPath);
      if (fs.existsSync(sessionDir)) {
        // Supprimer les fichiers de lock Chromium récursivement avant la suppression
        this.#removeLockFiles(sessionDir);
        
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`[WhatsApp] Session directory removed: ${sessionDir}`);
      }
      
      this.#isReady = false;
      this.#qrCount = 0;
      this.#loadingStuckCount = 0;
      this.#lastLoadingPercent = 0;
      
      return true;
    } catch (error) {
      console.error(`[WhatsApp] Failed to clear session:`, error.message);
      return false;
    }
  }

  /**
   * Réinitialise le client après une session corrompue
   * @param {boolean} autoSendQr - Envoyer automatiquement le premier QR sur Telegram
   */
  async reinitialize(autoSendQr = true) {
    console.log(`[WhatsApp] Reinitializing client...`);
    await this.clearSession();
    this.#autoSendQr = autoSendQr;  // Envoyer automatiquement le prochain QR
    this.#initClient();
    return this.initialize();
  }

  async initialize() {
    this.#resetLoadingTimeout();
    return this.#client.initialize();
  }

  async sendStateTyping(chatId) {
    if (!this.#isReady) return;
    try {
      const chat = await this.#client.getChatById(chatId);
      await chat.sendStateTyping();
    } catch (error) {
      // Silently fail if we can't get the chat
      console.error('Failed to send typing state:', error.message);
    }
  }

  async sendMessage(chatId, content) {
    if (!this.#isReady) {
      throw new Error('WhatsApp client is not ready');
    }
    await this.#client.sendMessage(chatId, content);
  }

  async getChatById(chatId) {
    return this.#client.getChatById(chatId);
  }

  async destroy() {
    // Clear loading timeout
    if (this.#loadingTimeout) {
      clearTimeout(this.#loadingTimeout);
      this.#loadingTimeout = null;
    }
    
    try {
      await this.#client.destroy();
    } catch (error) {
      console.error('[WhatsApp] Error during destroy:', error.message);
    }
    this.#isReady = false;
  }

  get isReady() {
    return this.#isReady;
  }

  get sessionPath() {
    return this.#sessionPath;
  }

  /**
   * Retourne le QR code actuel s'il existe
   */
  get currentQr() {
    return this.#currentQr;
  }

  /**
   * Indique si un QR code est en attente de scan
   */
  get needsQrScan() {
    return !this.#isReady && this.#currentQr !== null;
  }

  /**
   * Demande l'envoi du QR code sur Telegram
   * Si un QR existe déjà, l'envoie immédiatement
   * Sinon, le prochain QR reçu sera envoyé
   */
  requestQrCode() {
    if (this.#isReady) {
      return { success: false, reason: 'already_connected' };
    }
    
    if (this.#currentQr) {
      // QR déjà disponible, l'envoyer maintenant
      this.emit('qr', this.#currentQr);
      return { success: true, reason: 'sent' };
    }
    
    // Marquer qu'on veut le prochain QR
    this.#qrRequested = true;
    return { success: true, reason: 'waiting' };
  }

  /**
   * Supprime récursivement les fichiers de lock Chromium dans un répertoire
   */
  #removeLockFiles(dir) {
    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.#removeLockFiles(fullPath);
        } else if (lockFiles.includes(entry.name)) {
          try {
            fs.unlinkSync(fullPath);
            console.log(`[WhatsApp] Removed lock file: ${fullPath}`);
          } catch (e) {
            // Ignorer si on ne peut pas supprimer
          }
        }
      }
    } catch (e) {
      // Ignorer les erreurs de lecture
    }
  }
}
