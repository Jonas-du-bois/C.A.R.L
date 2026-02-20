import { Config } from './Config.js';
import { Logger } from '../utils/Logger.js';
import { SQLiteDatabase } from '../repositories/Database.js';
import { MessageRepository } from '../repositories/MessageRepository.js';
import { AIService } from '../services/AIService.js';
import { WhatsAppService } from '../services/WhatsAppService.js';
import { CalendarService } from '../services/CalendarService.js';
import { TelegramService } from '../services/TelegramService.js';
import { CronService } from '../services/CronService.js';
import { QueueService } from '../services/QueueService.js';
import { MessageHandler } from '../handlers/MessageHandler.js';
import { GatekeeperHandler } from '../handlers/GatekeeperHandler.js';
import { TelegramCommandHandler } from '../handlers/TelegramCommandHandler.js';
import { Message } from '../domain/Message.js';

/**
 * Application - Point d'entrée principal de C.A.R.L.
 * 
 * Cette classe orchestre tous les services et handlers de l'application.
 * Elle gère le cycle de vie de l'application et la connexion entre les composants.
 * 
 * @class
 */

// Mots-clés pour détecter les messages organisationnels dans les groupes
const ORGANIZATIONAL_KEYWORDS = [
  // Événements et rendez-vous
  'rdv', 'rendez-vous', 'rendezvous', 'meeting', 'réunion', 'reunion',
  // Temps
  'demain', 'ce soir', 'samedi', 'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi',
  'semaine prochaine', 'weekend', 'week-end',
  // Heures
  /\d{1,2}[h:]\d{0,2}/i, /à \d{1,2}h/i,
  // Lieux et activités
  'on se retrouve', 'on se voit', 'chez', 'resto', 'restaurant', 'bar', 'café', 'cinema', 'cinéma',
  'soirée', 'fête', 'anniversaire', 'mariage', 'apéro', 'bbq', 'barbecue',
  // Propositions
  'ça vous dit', 'ca vous dit', 'qui est dispo', 'qui vient', 'on fait quoi',
  'vous êtes libres', 'vous etes libres', 'dispo ?', 'disponible',
  // Confirmations
  'je viens', 'je serai là', 'je serai la', 'compte sur moi', 'présent', 'ok pour',
  // Sport et activités
  'match', 'entrainement', 'entraînement', 'course', 'rando', 'randonnée', 'ski', 'sortie'
];

export class Application {
  #config;
  #logger;
  #db;
  #whatsapp;
  #queue;
  #telegramService;
  #groupMessageTimestamps = new Map(); // Rate limiting pour les groupes

  constructor() {
    this.#config = new Config();
    this.#logger = new Logger();
    this.#db = new SQLiteDatabase(this.#config);
    this.#queue = new QueueService({ concurrency: 3 });

    // 🛡️ Sentinel: Clean up group timestamps periodically to prevent memory leaks
    setInterval(() => this.#cleanupGroupTimestamps(), 5 * 60 * 1000).unref();
  }

  /**
   * Nettoie les timestamps de groupe obsolètes
   * Empêche la fuite de mémoire si le bot est ajouté à de nombreux groupes
   */
  #cleanupGroupTimestamps() {
    const now = Date.now();
    for (const [groupId, timestamp] of this.#groupMessageTimestamps.entries()) {
      // Supprimer les entrées plus vieilles que 5 minutes
      if (now - timestamp > 5 * 60 * 1000) {
        this.#groupMessageTimestamps.delete(groupId);
      }
    }
  }

  /**
   * Démarre l'application
   * Initialise tous les services et handlers
   */
  async start() {
    try {
      this.#logger.info('Starting C.A.R.L. application...');

      // Initialisation des services
      const { messageRepo, aiService, calendarService, cronService, messageHandler } = 
        this.#initializeServices();

      // Configuration des commandes Telegram
      this.#initializeTelegramCommands(messageRepo, cronService);

      // Configuration des événements WhatsApp
      this.#setupWhatsAppEvents(messageRepo, messageHandler);

      // Démarrage
      this.#setupGracefulShutdown();
      await this.#whatsapp.initialize();
      
      this.#logger.info('WhatsApp client initialized');
    } catch (error) {
      this.#logger.error('Application failed to start', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Vérifie si WhatsApp est prêt
   */
  get isWhatsAppReady() {
    return this.#whatsapp?.isReady || false;
  }

  // ============================================
  // INITIALISATION DES SERVICES
  // ============================================

  /**
   * Initialise tous les services de l'application
   * @returns {Object} Services initialisés
   */
  #initializeServices() {
    const messageRepo = new MessageRepository(this.#db);
    const aiService = new AIService(this.#config);
    const calendarService = new CalendarService(this.#config);
    
    this.#telegramService = new TelegramService(this.#config);
    
    const cronService = new CronService(
      this.#config, 
      messageRepo, 
      this.#telegramService, 
      this.#logger, 
      aiService, 
      calendarService
    );

    this.#whatsapp = new WhatsAppService(this.#config);
    const gatekeeper = new GatekeeperHandler();

    this.#logger.info(`Using AI provider: ${this.#config.ai.provider} (${this.#config.ai.model})`);

    const messageHandler = new MessageHandler({
      gatekeeper,
      openAI: aiService,
      calendar: calendarService,
      repository: messageRepo,
      whatsapp: this.#whatsapp,
      logger: this.#logger,
      telegram: this.#telegramService
    });

    return { messageRepo, aiService, calendarService, cronService, messageHandler };
  }

  /**
   * Initialise les commandes Telegram
   */
  #initializeTelegramCommands(messageRepo, cronService) {
    const commandHandler = new TelegramCommandHandler({
      telegram: this.#telegramService,
      messageRepo,
      cronService,
      whatsappService: this.#whatsapp,
      config: this.#config,
      logger: this.#logger
    });

    commandHandler.registerAll();
  }

  // ============================================
  // ÉVÉNEMENTS WHATSAPP
  // ============================================

  /**
   * Configure les événements WhatsApp
   */
  #setupWhatsAppEvents(messageRepo, messageHandler) {
    this.#setupWhatsAppConnectionEvents();
    this.#setupIncomingMessageHandler(messageRepo, messageHandler);
    this.#setupOutgoingMessageHandler(messageRepo);
  }

  /**
   * Configure les événements de connexion WhatsApp
   */
  #setupWhatsAppConnectionEvents() {
    this.#whatsapp.on('qr', async (qr) => {
      this.#logger.info('QR Code received - scan with WhatsApp mobile app');
      await this.#telegramService.sendQRCode(qr);
    });

    this.#whatsapp.on('ready', async () => {
      this.#logger.info('WhatsApp client is ready');
      await this.#telegramService.sendMessage('✅ C.A.R.L. est en ligne et opérationnel !');
    });

    this.#whatsapp.on('disconnected', async (reason) => {
      this.#logger.warn('WhatsApp disconnected', { reason });
      await this.#telegramService.sendMessage(`⚠️ C.A.R.L. déconnecté: ${reason}`);
    });

    this.#whatsapp.on('loading_stuck', async (percent) => {
      this.#logger.warn(`WhatsApp stuck at ${percent}% - clearing session`);
      await this.#telegramService.sendMessage(
        `⚠️ Session WhatsApp corrompue (bloquée à ${percent}%).\n` +
        `🔄 Nettoyage automatique en cours...\n` +
        `📱 Un nouveau QR code sera envoyé.`
      );
      
      try {
        await this.#whatsapp.reinitialize();
      } catch (error) {
        this.#logger.error('Failed to reinitialize WhatsApp', { error: error.message });
        await this.#telegramService.sendMessage(
          `❌ Échec de la réinitialisation.\n` +
          `Redémarrez le conteneur: docker compose restart`
        );
      }
    });
  }

  /**
   * Configure le handler pour les messages entrants
   */
  #setupIncomingMessageHandler(messageRepo, messageHandler) {
    this.#whatsapp.on('message', async (msg) => {
      try {
        // Ignorer ses propres messages et les statuts
        if (msg.fromMe || msg.isStatus) return;

        const chat = await this.#getChatSafe(msg);
        
        // Gestion des messages de groupe
        if (chat?.isGroup) {
          await this.#handleGroupMessage(msg, chat, messageRepo);
          return;
        }

        // Éviter les doublons - vérifier si le message existe déjà
        const existingMessage = messageRepo.getMessageById(msg.id.id);
        if (existingMessage) {
          return; // Message déjà sauvegardé, ignorer silencieusement
        }

        const message = this.#createMessage(msg);
        const metadata = this.#extractMessageMetadata(msg, chat);

        // Mode économique vs mode complet
        if (!this.#config.features.enableAutoResponse) {
          this.#saveMessageWithoutAI(messageRepo, message, metadata);
        } else {
          this.#queue.enqueue(msg.from, async () => {
            await messageHandler.handle(message, metadata);
          });
        }
      } catch (error) {
        // Ignorer les erreurs de contrainte UNIQUE (doublon)
        if (error.message?.includes('UNIQUE constraint')) {
          return;
        }
        this.#logger.error('Error processing incoming message', { 
          error: error.message,
          from: msg?.from 
        });
      }
    });
  }

  /**
   * Configure le handler pour les messages sortants (envoyés par Jonas manuellement)
   * NOTE: message_create est déclenché pour TOUS les messages, donc on filtre strictement
   */
  #setupOutgoingMessageHandler(messageRepo) {
    this.#whatsapp.on('message_create', async (msg) => {
      try {
        // IMPORTANT: Ne capturer QUE les messages envoyés par Jonas (fromMe = true)
        // message_create est déclenché pour tous les messages, y compris les entrants!
        if (!msg.fromMe) return;
        
        // Ignorer les statuts WhatsApp
        if (msg.isStatus) return;

        const chat = await this.#getChatSafe(msg);
        if (chat?.isGroup) return;

        // Éviter les doublons - vérifier si le message existe déjà
        const existingMessage = messageRepo.getMessageById(msg.id.id);
        if (existingMessage) {
          return; // Message déjà sauvegardé, ignorer silencieusement
        }

        const contact = messageRepo.findOrCreateContact(msg.to, {
          pushName: chat?.name || null,
          displayName: chat?.name || null,
          isGroup: false
        });

        messageRepo.saveOutgoingMessage(
          msg.id.id,
          contact.id,
          msg.body,
          msg.timestamp * 1000
        );

        this.#logger.debug('Outgoing message saved', {
          to: msg.to,
          bodyPreview: msg.body?.substring(0, 50)
        });
      } catch (error) {
        // Ignorer les erreurs de contrainte UNIQUE (doublon)
        if (error.message?.includes('UNIQUE constraint')) {
          return;
        }
        this.#logger.error('Error saving outgoing message', {
          error: error.message,
          to: msg?.to
        });
      }
    });
  }

  // ============================================
  // MÉTHODES UTILITAIRES
  // ============================================

  /**
   * Récupère le chat de manière sécurisée
   */
  async #getChatSafe(msg) {
    try {
      return await msg.getChat();
    } catch {
      return null;
    }
  }

  /**
   * Vérifie si un message contient du contenu organisationnel
   * @param {string} text - Texte du message
   * @returns {boolean}
   */
  #isOrganizationalMessage(text) {
    if (!text || text.length < 5) return false;
    
    const lowerText = text.toLowerCase();
    
    for (const keyword of ORGANIZATIONAL_KEYWORDS) {
      if (keyword instanceof RegExp) {
        if (keyword.test(text)) return true;
      } else if (lowerText.includes(keyword)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Rate limiting pour les groupes (max 1 message par groupe toutes les 30 secondes)
   * @param {string} groupId - ID du groupe
   * @returns {boolean} - true si le message peut être traité
   */
  #canProcessGroupMessage(groupId) {
    const now = Date.now();
    const lastProcessed = this.#groupMessageTimestamps.get(groupId) || 0;
    
    // Limite: 1 message organisationnel par groupe toutes les 30 secondes
    if (now - lastProcessed < 30000) {
      return false;
    }
    
    this.#groupMessageTimestamps.set(groupId, now);
    return true;
  }

  /**
   * Gère les messages de groupe (détection de contenu organisationnel uniquement)
   * @param {Object} msg - Message WhatsApp
   * @param {Object} chat - Chat WhatsApp
   * @param {MessageRepository} messageRepo - Repository des messages
   */
  async #handleGroupMessage(msg, chat, messageRepo) {
    // Ignorer les messages trop courts ou sans texte
    if (!msg.body || msg.body.length < 10) return;

    // Vérifier si c'est un message organisationnel (détection LOCALE, sans API)
    if (!this.#isOrganizationalMessage(msg.body)) {
      return; // Pas organisationnel, on ignore
    }

    // Rate limiting pour éviter trop de stockage
    if (!this.#canProcessGroupMessage(chat.id._serialized)) {
      this.#logger.debug('Group message rate limited', { 
        group: chat.name,
        message: msg.body.substring(0, 50)
      });
      return;
    }

    // Sauvegarder le message organisationnel du groupe
    try {
      // Récupérer l'auteur du message dans le groupe
      const contact = await msg.getContact();
      const authorName = contact?.pushname || contact?.name || 'Inconnu';

      const groupContact = messageRepo.findOrCreateContact(chat.id._serialized, {
        pushName: chat.name,
        displayName: chat.name,
        isGroup: true
      });

      messageRepo.saveIncomingMessage(
        new Message({
          id: msg.id.id,
          from: chat.id._serialized,
          body: `[${authorName}] ${msg.body}`,
          timestamp: msg.timestamp * 1000
        }),
        groupContact.id,
        {
          mediaType: null,
          isForwarded: msg.isForwarded || false,
          isBroadcast: false,
          quotedMessageId: null
        }
      );

      this.#logger.info('📅 Organizational message detected in group', {
        group: chat.name,
        author: authorName,
        preview: msg.body.substring(0, 80)
      });
    } catch (error) {
      if (!error.message?.includes('UNIQUE constraint')) {
        this.#logger.error('Error saving group message', { error: error.message });
      }
    }
  }

  /**
   * Crée un objet Message à partir d'un message WhatsApp
   */
  #createMessage(msg) {
    return new Message({
      id: msg.id.id,
      from: msg.from,
      body: msg.body,
      timestamp: msg.timestamp * 1000
    });
  }

  /**
   * Extrait les métadonnées d'un message
   */
  #extractMessageMetadata(msg, chat) {
    return {
      pushName: msg._data?.notifyName || null,
      displayName: chat?.name || msg._data?.notifyName || null,
      isGroup: chat?.isGroup || false,
      mediaType: msg.hasMedia ? msg.type : null,
      mediaUrl: null,
      isForwarded: msg.isForwarded || false,
      isBroadcast: msg.broadcast || false,
      quotedMessageId: msg.hasQuotedMsg ? msg._data?.quotedMsgId : null
    };
  }

  /**
   * Sauvegarde un message sans analyse IA (mode économique)
   */
  #saveMessageWithoutAI(messageRepo, message, metadata) {
    const contact = messageRepo.findOrCreateContact(message.from, {
      pushName: metadata.pushName,
      displayName: metadata.displayName,
      isGroup: metadata.isGroup
    });
    
    messageRepo.saveIncomingMessage(message, contact.id, {
      mediaType: metadata.mediaType,
      mediaUrl: metadata.mediaUrl,
      isForwarded: metadata.isForwarded,
      isBroadcast: metadata.isBroadcast,
      quotedMessageId: metadata.quotedMessageId
    });
    
    this.#logger.debug('Message saved (no AI analysis - auto-response disabled)', {
      from: message.from
    });
  }

  // ============================================
  // SHUTDOWN
  // ============================================

  /**
   * Configure l'arrêt gracieux de l'application
   */
  #setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.#logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        this.#telegramService?.stopPolling();
        await this.#queue.onIdle();
        
        if (this.#whatsapp) {
          await this.#whatsapp.destroy();
        }
        
        this.#logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        this.#logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

