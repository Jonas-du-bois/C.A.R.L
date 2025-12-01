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

          // Mode économique : sauvegarder uniquement, sans analyse IA
          if (!this.#config.features.enableAutoResponse) {
            // Sauvegarder le message sans analyse IA (économise les requêtes API)
            const contact = messageRepo.findOrCreateContact(message.from, {
              pushName: messageMetadata.pushName,
              displayName: messageMetadata.displayName,
              isGroup: messageMetadata.isGroup
            });
            
            messageRepo.saveIncomingMessage(message, contact.id, {
              mediaType: messageMetadata.mediaType,
              mediaUrl: messageMetadata.mediaUrl,
              isForwarded: messageMetadata.isForwarded,
              isBroadcast: messageMetadata.isBroadcast,
              quotedMessageId: messageMetadata.quotedMessageId
            });
            
            this.#logger.debug('Message saved (no AI analysis - auto-response disabled)', {
              from: message.from
            });
            return;
          }

          // Mode complet : analyse IA + réponse automatique
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
    // /rapport - Génère un rapport complet avec IA (journée en cours)
    this.#telegramService.onCommand('rapport', async () => {
      await this.#telegramService.sendMessage('⏳ Génération du rapport de la journée en cours...');
      await cronService.generateAndSendReport();
    });

    // /stats - Statistiques rapides sans IA (journée en cours)
    this.#telegramService.onCommand('stats', async () => {
      const stats = messageRepo.getQuickStats();
      const report = `📊 <b>Stats du jour</b>\n\n` +
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

    // /heklp - Afficher l'aide
    this.#telegramService.onCommand('help', async () => {
      const helpMessage = 
        '🤖 <b>Commandes C.A.R.L.</b>\n\n' +
        '/rapport - Génère un rapport complet avec IA (journée en cours)\n' +
        '/stats - Statistiques rapides sans IA (journée en cours)\n' +
        '/status - État du système\n' +
        '/connect - Obtenir le QR code WhatsApp\n' +
        '/reset - Réinitialiser la session WhatsApp\n' +
        '/tasks - Afficher les tâches et événements à planifier\n' +
        '/help - Afficher cette aide';
      await this.#telegramService.sendMessage(helpMessage);
    });

    // /tasks - Afficher les tâches et événements à planifier avec boutons
    this.#telegramService.onCommand('tasks', async () => {
      const data = cronService.getLastReportData();
      
      if (!data) {
        await this.#telegramService.sendMessage(
          '📋 <b>Aucune donnée disponible</b>\n\n' +
          'Générez d\'abord un rapport avec /rapport pour avoir des tâches à planifier.'
        );
        return;
      }

      const taches = data.taches || [];
      const evenements = data.agenda?.evenements_proposes || [];
      
      if (taches.length === 0 && evenements.length === 0) {
        await this.#telegramService.sendMessage(
          '✅ <b>Rien à planifier !</b>\n\n' +
          'Aucune tâche ou événement détecté dans le dernier rapport.'
        );
        return;
      }

      // Construire le message avec les items
      let message = '📋 <b>TÂCHES & ÉVÉNEMENTS À PLANIFIER</b>\n';
      message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      message += '<i>Cliquez sur un bouton pour ajouter directement à votre agenda Google</i>\n\n';

      const buttons = [];
      let itemIndex = 0;

      // Ajouter les tâches
      if (taches.length > 0) {
        message += '✅ <b>TÂCHES:</b>\n';
        taches.forEach((t, i) => {
          const prioIcon = { 'haute': '🔴', 'moyenne': '🟡', 'basse': '🟢' }[t.priorite] || '⚪';
          message += `${prioIcon} ${t.titre}\n`;
          if (t.deadline) message += `   ⏰ ${t.deadline}\n`;
          message += '\n';
          
          buttons.push([{
            text: `✅ ${t.titre.substring(0, 30)}${t.titre.length > 30 ? '...' : ''}`,
            callback_data: `task_${itemIndex}`
          }]);
          itemIndex++;
        });
      }

      // Ajouter les événements proposés
      if (evenements.length > 0) {
        message += '📅 <b>ÉVÉNEMENTS PROPOSÉS:</b>\n';
        evenements.forEach((e, i) => {
          message += `🗓️ ${e.activite} avec ${e.expediteur}\n`;
          message += `   📍 ${e.quand}\n\n`;
          
          buttons.push([{
            text: `📅 ${e.activite} - ${e.quand}`.substring(0, 40),
            callback_data: `event_${itemIndex}`
          }]);
          itemIndex++;
        });
      }

      await this.#telegramService.sendMessage(message, { inlineKeyboard: buttons });
    });

    // Handler pour les clics sur les boutons de tâches
    this.#telegramService.onCallback('task_', async (data, query) => {
      const index = parseInt(data.replace('task_', ''));
      const reportData = cronService.getLastReportData();
      const calendarService = cronService.getCalendarService();
      
      if (!reportData?.taches?.[index]) {
        await this.#telegramService.sendMessage('❌ Tâche introuvable. Regénérez le rapport avec /rapport');
        return;
      }
      
      if (!calendarService?.isConfigured) {
        await this.#telegramService.sendMessage('❌ Google Calendar non configuré');
        return;
      }

      const tache = reportData.taches[index];
      
      // Créer une TÂCHE (pas un événement) dans Google Calendar
      const taskData = {
        summary: tache.titre,
        description: `${tache.description}\n\nPriorité: ${tache.priorite || 'normale'}\nSource: ${tache.source || 'C.A.R.L.'}`
      };

      // Si une deadline est mentionnée, essayer de la parser
      if (tache.deadline) {
        const parsed = this.#parseDate(tache.deadline, false); // false = pas de correction d'heure pour les tâches
        if (parsed) {
          taskData.dueDate = parsed;
        }
      }

      try {
        const result = await calendarService.createTask(taskData);
        await this.#telegramService.sendMessage(
          `✅ <b>Tâche ajoutée à l'agenda !</b>\n\n` +
          `📋 ${tache.titre}\n` +
          `${result}`
        );
      } catch (error) {
        await this.#telegramService.sendMessage(`❌ Erreur: ${error.message}`);
      }
    });

    // Handler pour les clics sur les boutons d'événements
    this.#telegramService.onCallback('event_', async (data, query) => {
      const reportData = cronService.getLastReportData();
      const tachesCount = reportData?.taches?.length || 0;
      const eventIndex = parseInt(data.replace('event_', '')) - tachesCount;
      const calendarService = cronService.getCalendarService();
      
      if (!reportData?.agenda?.evenements_proposes?.[eventIndex]) {
        await this.#telegramService.sendMessage('❌ Événement introuvable. Regénérez le rapport avec /rapport');
        return;
      }
      
      if (!calendarService?.isConfigured) {
        await this.#telegramService.sendMessage('❌ Google Calendar non configuré');
        return;
      }

      const evt = reportData.agenda.evenements_proposes[eventIndex];
      
      // Estimer la durée selon le type d'activité
      const durations = {
        'volley': 120, 'foot': 120, 'sport': 120, 'tennis': 90,
        'café': 60, 'coffee': 60,
        'dîner': 120, 'dinner': 120, 'resto': 120,
        'réunion': 60, 'meeting': 60
      };
      let duration = 90; // défaut
      const activiteLower = evt.activite?.toLowerCase() || '';
      for (const [key, dur] of Object.entries(durations)) {
        if (activiteLower.includes(key)) {
          duration = dur;
          break;
        }
      }

      const eventData = {
        summary: `${evt.activite} avec ${evt.expediteur}`,
        description: `Proposé via WhatsApp\nQuand: ${evt.quand}`,
        duration: duration
      };

      // Parser la date/heure du "quand"
      const parsed = this.#parseDate(evt.quand);
      if (parsed) {
        eventData.start = parsed;
      }

      try {
        const result = await calendarService.createEvent(eventData);
        await this.#telegramService.sendMessage(
          `✅ <b>Événement ajouté à l'agenda !</b>\n\n` +
          `📅 ${evt.activite} avec ${evt.expediteur}\n` +
          `📍 ${evt.quand}\n` +
          `${result}`
        );
      } catch (error) {
        await this.#telegramService.sendMessage(`❌ Erreur: ${error.message}`);
      }
    });

    // Start polling for commands
    this.#telegramService.startPolling();
    this.#logger.info('Telegram commands registered');
  }

  /**
   * Parse une date en français vers un objet Date
   * @param {string} dateStr - La chaîne de date à parser
   * @param {boolean} correctTimezone - Si true, corrige le décalage horaire (Docker UTC -> Europe/Zurich)
   */
  #parseDate(dateStr, correctTimezone = true) {
    if (!dateStr) return null;
    
    const now = new Date();
    const lower = dateStr.toLowerCase();
    
    // Jours de la semaine
    const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const joursShort = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    
    let targetDate = new Date(now);
    
    // Chercher un jour de la semaine
    for (let i = 0; i < jours.length; i++) {
      if (lower.includes(jours[i]) || lower.includes(joursShort[i])) {
        const currentDay = now.getDay();
        let daysToAdd = i - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7; // Prochaine occurrence
        targetDate.setDate(now.getDate() + daysToAdd);
        break;
      }
    }
    
    // Chercher "demain"
    if (lower.includes('demain')) {
      targetDate.setDate(now.getDate() + 1);
    }
    
    // Chercher "aujourd'hui"
    if (lower.includes("aujourd'hui") || lower.includes('ce soir')) {
      targetDate = new Date(now);
    }

    // Chercher une heure (ex: "20h", "20h30", "14:30")
    const heureMatch = lower.match(/(\d{1,2})[h:](\d{2})?/);
    if (heureMatch) {
      let hours = parseInt(heureMatch[1]);
      const minutes = parseInt(heureMatch[2] || '0');
      
      // Correction du décalage horaire: Docker est en UTC, on est en UTC+1
      // L'utilisateur dit "20h" mais le serveur est en UTC, donc on doit mettre 19h UTC
      if (correctTimezone) {
        hours = hours - 1;
        if (hours < 0) hours += 24;
      }
      
      targetDate.setHours(hours, minutes, 0, 0);
    } else {
      // Défaut: 10h du matin (9h UTC)
      targetDate.setHours(correctTimezone ? 9 : 10, 0, 0, 0);
    }
    
    return targetDate;
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
