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
import { Message } from '../domain/Message.js';

export class Application {
  #config;
  #logger;
  #db;
  #whatsapp;
  #queue;
  #telegramService;

  constructor() {
    this.#config = new Config();
    this.#logger = new Logger();
    this.#db = new SQLiteDatabase(this.#config);
    this.#queue = new QueueService({ concurrency: 3 });
  }

  async start() {
    try {
      this.#logger.info('Starting C.A.R.L. application...');

      const messageRepo = new MessageRepository(this.#db);
      const aiService = new AIService(this.#config);
      const calendarService = new CalendarService(this.#config);
      this.#telegramService = new TelegramService(this.#config);
      const cronService = new CronService(this.#config, messageRepo, this.#telegramService, this.#logger, aiService, calendarService);

      // Setup Telegram commands
      this.#setupTelegramCommands(messageRepo, aiService, cronService);

      this.#whatsapp = new WhatsAppService(this.#config);
      const gatekeeper = new GatekeeperHandler();

      // Log which AI provider is being used
      this.#logger.info(`Using AI provider: ${this.#config.ai.provider} (${this.#config.ai.model})`);

      const messageHandler = new MessageHandler({
        gatekeeper,
        openAI: aiService,  // AIService is backward compatible with OpenAI interface
        calendar: calendarService,
        repository: messageRepo,
        whatsapp: this.#whatsapp,
        logger: this.#logger,
        telegram: this.#telegramService
      });

      // Setup WhatsApp event handlers
      this.#whatsapp.on('qr', async (qr) => {
        this.#logger.info('QR Code received - scan with WhatsApp mobile app');
        // Send QR code to Telegram as an image
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

      // Gérer les sessions bloquées (99%)
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

      this.#whatsapp.on('message', async (msg) => {
        try {
          // Skip own messages
          if (msg.fromMe) return;

          // Skip status updates
          if (msg.isStatus) return;

          // Get chat info (with error handling)
          let chat = null;
          
          try {
            chat = await msg.getChat();
          } catch (e) {
            // Chat info is optional, continue without it
          }
          
          // Skip group messages
          if (chat?.isGroup) return;

          const message = new Message({
            id: msg.id.id,
            from: msg.from,
            body: msg.body,
            timestamp: msg.timestamp * 1000
          });

          // Use msg._data directly - getContact() is unreliable in current whatsapp-web.js version
          const messageMetadata = {
            pushName: msg._data?.notifyName || null,
            displayName: chat?.name || msg._data?.notifyName || null,
            isGroup: chat?.isGroup || false,
            mediaType: msg.hasMedia ? msg.type : null,
            mediaUrl: null,
            isForwarded: msg.isForwarded || false,
            isBroadcast: msg.broadcast || false,
            quotedMessageId: msg.hasQuotedMsg ? msg._data?.quotedMsgId : null
          };

          // Enqueue message processing with sender-based ordering
          this.#queue.enqueue(msg.from, async () => {
            await messageHandler.handle(message, messageMetadata);
          });
        } catch (error) {
          this.#logger.error('Error processing incoming message', { 
            error: error.message,
            from: msg?.from 
          });
        }
      });

      // Setup graceful shutdown
      this.#setupGracefulShutdown();

      await this.#whatsapp.initialize();
      this.#logger.info('WhatsApp client initialized');
    } catch (error) {
      this.#logger.error('Application failed to start', { error: error.message });
      process.exit(1);
    }
  }

  get isWhatsAppReady() {
    return this.#whatsapp?.isReady || false;
  }

  #setupTelegramCommands(messageRepo, aiService, cronService) {
    // /rapport - Génère un rapport complet avec IA
    this.#telegramService.onCommand('rapport', async () => {
      await this.#telegramService.sendMessage('⏳ Génération du rapport en cours...');
      await cronService.generateAndSendReport(24);
    });

    // /stats - Statistiques rapides sans IA
    this.#telegramService.onCommand('stats', async () => {
      const stats = messageRepo.getQuickStats(24);
      const report = `📊 <b>Stats rapides (24h)</b>\n\n` +
        `📥 Messages reçus: ${stats.received}\n` +
        `📤 Réponses envoyées: ${stats.sent}\n` +
        `👥 Contacts: ${stats.contacts}\n` +
        `❌ Erreurs: ${stats.errors}\n\n` +
        `📁 Par catégorie:\n` +
        Object.entries(stats.byCategory).map(([k, v]) => `• ${k}: ${v}`).join('\n');
      await this.#telegramService.sendMessage(report);
    });

    // /status - État du système
    this.#telegramService.onCommand('status', async () => {
      const whatsappStatus = this.isWhatsAppReady 
        ? '✅ Connecté' 
        : (this.#whatsapp.needsQrScan ? '📱 En attente de scan QR (/connect)' : '❌ Déconnecté');
      
      const status = `🤖 <b>État C.A.R.L.</b>\n\n` +
        `📱 WhatsApp: ${whatsappStatus}\n` +
        `🧠 IA: ${this.#config.ai.provider} (${this.#config.ai.model})\n` +
        `⏰ Uptime: ${this.#formatUptime(process.uptime())}`;
      await this.#telegramService.sendMessage(status);
    });

    // /connect - Obtenir le QR code WhatsApp
    this.#telegramService.onCommand('connect', async () => {
      if (this.isWhatsAppReady) {
        await this.#telegramService.sendMessage('✅ WhatsApp est déjà connecté !');
        return;
      }
      
      const result = this.#whatsapp.requestQrCode();
      
      if (result.reason === 'sent') {
        // Le QR sera envoyé via l'event handler
        await this.#telegramService.sendMessage('📱 QR Code envoyé ! Scannez-le avec WhatsApp.');
      } else if (result.reason === 'waiting') {
        await this.#telegramService.sendMessage('⏳ En attente du QR code... Il sera envoyé dès qu\'il sera prêt.');
      }
    });

    // /reset - Réinitialiser la session WhatsApp
    this.#telegramService.onCommand('reset', async () => {
      await this.#telegramService.sendMessage('🔄 Réinitialisation de la session WhatsApp...');
      try {
        await this.#whatsapp.reinitialize();
        await this.#telegramService.sendMessage('✅ Session nettoyée. Utilisez /connect pour obtenir le nouveau QR code.');
      } catch (error) {
        await this.#telegramService.sendMessage(`❌ Erreur: ${error.message}\nRedémarrez le conteneur.`);
      }
    });

    // Start polling for commands
    this.#telegramService.startPolling();
    this.#logger.info('Telegram commands registered');
  }

  #formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  #setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.#logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Stop Telegram polling
        this.#telegramService?.stopPolling();
        
        // Wait for queue to drain
        await this.#queue.onIdle();
        
        // Destroy WhatsApp client
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
