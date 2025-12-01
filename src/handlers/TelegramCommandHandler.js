/**
 * TelegramCommandHandler - Gère toutes les commandes Telegram pour C.A.R.L.
 * 
 * Ce handler centralise la logique des commandes Telegram, permettant
 * à Application.js de rester léger et focalisé sur l'orchestration.
 * 
 * @module handlers/TelegramCommandHandler
 */

// ============================================
// CONSTANTES
// ============================================

/**
 * Durées estimées par type d'activité (en minutes)
 * Utilisé pour créer des événements calendrier
 */
const ACTIVITY_DURATIONS = {
  volley: 120,
  foot: 120,
  sport: 120,
  tennis: 90,
  café: 60,
  coffee: 60,
  dîner: 120,
  dinner: 120,
  resto: 120,
  réunion: 60,
  meeting: 60
};

/**
 * Jours de la semaine en français
 */
const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_SEMAINE_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

// ============================================
// CLASSE PRINCIPALE
// ============================================

export class TelegramCommandHandler {
  #telegram;
  #messageRepo;
  #cronService;
  #whatsappService;
  #config;
  #logger;

  /**
   * @param {Object} deps - Dépendances injectées
   * @param {TelegramService} deps.telegram - Service Telegram
   * @param {MessageRepository} deps.messageRepo - Repository des messages
   * @param {CronService} deps.cronService - Service cron pour les rapports
   * @param {WhatsAppService} deps.whatsappService - Service WhatsApp
   * @param {Config} deps.config - Configuration
   * @param {Logger} deps.logger - Logger
   */
  constructor({ telegram, messageRepo, cronService, whatsappService, config, logger }) {
    this.#telegram = telegram;
    this.#messageRepo = messageRepo;
    this.#cronService = cronService;
    this.#whatsappService = whatsappService;
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Enregistre toutes les commandes Telegram
   */
  registerAll() {
    this.#registerRapportCommand();
    this.#registerStatsCommand();
    this.#registerStatusCommand();
    this.#registerConnectCommand();
    this.#registerResetCommand();
    this.#registerHelpCommand();
    this.#registerDebugCommand();
    this.#registerTasksCommand();
    this.#registerTaskCallbacks();
    this.#registerEventCallbacks();

    this.#telegram.startPolling();
    this.#logger.info('Telegram commands registered');
  }

  // ============================================
  // COMMANDES PRINCIPALES
  // ============================================

  /**
   * /rapport - Génère un rapport complet avec IA
   */
  #registerRapportCommand() {
    this.#telegram.onCommand('rapport', async () => {
      await this.#telegram.sendMessage('⏳ Génération du rapport de la journée en cours...');
      await this.#cronService.generateAndSendReport();
    });
  }

  /**
   * /stats - Statistiques rapides sans IA
   */
  #registerStatsCommand() {
    this.#telegram.onCommand('stats', async () => {
      const stats = this.#messageRepo.getQuickStats();
      const totalMessages = stats.received + stats.sent;
      
      const categoriesText = Object.keys(stats.byCategory).length > 0
        ? Object.entries(stats.byCategory).map(([k, v]) => `• ${k}: ${v}`).join('\n')
        : '• Aucun message analysé';

      const report = 
        `📊 <b>Stats du jour</b>\n\n` +
        `📨 Total messages: ${totalMessages}\n` +
        `├ 📥 Reçus (des autres): ${stats.received}\n` +
        `└ 📤 Envoyés (par toi): ${stats.sent}\n\n` +
        `👥 Contacts actifs: ${stats.contacts}\n` +
        `❌ Erreurs: ${stats.errors}\n\n` +
        `📁 Par catégorie:\n${categoriesText}`;

      await this.#telegram.sendMessage(report);
    });
  }

  /**
   * /status - État du système
   */
  #registerStatusCommand() {
    this.#telegram.onCommand('status', async () => {
      const isReady = this.#whatsappService?.isReady || false;
      const needsQr = this.#whatsappService?.needsQrScan || false;
      
      let whatsappStatus;
      if (isReady) {
        whatsappStatus = '✅ Connecté';
      } else if (needsQr) {
        whatsappStatus = '📱 En attente de scan QR (/connect)';
      } else {
        whatsappStatus = '❌ Déconnecté';
      }

      const status = 
        `🤖 <b>État C.A.R.L.</b>\n\n` +
        `📱 WhatsApp: ${whatsappStatus}\n` +
        `🧠 IA: ${this.#config.ai.provider} (${this.#config.ai.model})\n` +
        `⏰ Uptime: ${this.#formatUptime(process.uptime())}`;

      await this.#telegram.sendMessage(status);
    });
  }

  /**
   * /connect - Obtenir le QR code WhatsApp
   */
  #registerConnectCommand() {
    this.#telegram.onCommand('connect', async () => {
      if (this.#whatsappService?.isReady) {
        await this.#telegram.sendMessage('✅ WhatsApp est déjà connecté !');
        return;
      }

      const result = this.#whatsappService.requestQrCode();

      if (result.reason === 'sent') {
        await this.#telegram.sendMessage('📱 QR Code envoyé ! Scannez-le avec WhatsApp.');
      } else if (result.reason === 'waiting') {
        await this.#telegram.sendMessage('⏳ En attente du QR code... Il sera envoyé dès qu\'il sera prêt.');
      }
    });
  }

  /**
   * /reset - Réinitialiser la session WhatsApp
   */
  #registerResetCommand() {
    this.#telegram.onCommand('reset', async () => {
      await this.#telegram.sendMessage('🔄 Réinitialisation de la session WhatsApp...');
      
      try {
        await this.#whatsappService.reinitialize();
        await this.#telegram.sendMessage('✅ Session nettoyée. Utilisez /connect pour obtenir le nouveau QR code.');
      } catch (error) {
        await this.#telegram.sendMessage(`❌ Erreur: ${error.message}\nRedémarrez le conteneur.`);
      }
    });
  }

  /**
   * /help - Afficher l'aide
   */
  #registerHelpCommand() {
    this.#telegram.onCommand('help', async () => {
      const helpMessage = 
        '🤖 <b>Commandes C.A.R.L.</b>\n\n' +
        '<b>📊 Rapports</b>\n' +
        '/rapport - Rapport complet avec IA\n' +
        '/stats - Statistiques rapides\n\n' +
        '<b>📱 WhatsApp</b>\n' +
        '/status - État du système\n' +
        '/connect - Obtenir le QR code\n' +
        '/reset - Réinitialiser la session\n\n' +
        '<b>📋 Tâches</b>\n' +
        '/tasks - Tâches et événements à planifier\n\n' +
        '<b>🔧 Debug</b>\n' +
        '/debug - Diagnostic des messages\n' +
        '/help - Cette aide';
      
      await this.#telegram.sendMessage(helpMessage);
    });
  }

  /**
   * /debug - Diagnostic des messages
   */
  #registerDebugCommand() {
    this.#telegram.onCommand('debug', async () => {
      try {
        const recentMessages = this.#messageRepo.getRecentMessagesDebug(10);
        const midnight = this.#getMidnightTimestamp();

        let debug = 
          `🔧 <b>Diagnostic C.A.R.L.</b>\n\n` +
          `⏰ Heure serveur: ${new Date().toISOString()}\n` +
          `🌅 Minuit local: ${new Date(midnight).toISOString()}\n` +
          `📊 Timestamp minuit: ${midnight}\n\n`;

        if (recentMessages.length === 0) {
          debug += '❌ Aucun message en base de données';
        } else {
          debug += `📨 <b>Derniers messages (${recentMessages.length}):</b>\n\n`;
          
          recentMessages.forEach((m, i) => {
            const date = new Date(m.received_at);
            const isToday = m.received_at >= midnight;
            const icon = isToday ? '✅' : '📅';
            const direction = m.direction === 'incoming' ? '→' : '←';
            const phone = m.phone_number?.split('@')[0] || 'inconnu';
            const bodyPreview = (m.body || '').substring(0, 50);
            const truncated = (m.body || '').length > 50 ? '...' : '';

            debug += 
              `${icon} ${i + 1}. ${direction} ${date.toLocaleString('fr-CH')}\n` +
              `   De: ${phone}\n` +
              `   Msg: "${bodyPreview}${truncated}"\n` +
              `   TS: ${m.received_at}\n\n`;
          });
        }

        await this.#telegram.sendMessage(debug);
      } catch (error) {
        await this.#telegram.sendMessage(`❌ Erreur debug: ${error.message}`);
      }
    });
  }

  /**
   * /tasks - Afficher les tâches et événements à planifier
   */
  #registerTasksCommand() {
    this.#telegram.onCommand('tasks', async () => {
      const data = this.#cronService.getLastReportData();

      if (!data) {
        await this.#telegram.sendMessage(
          '📋 <b>Aucune donnée disponible</b>\n\n' +
          'Générez d\'abord un rapport avec /rapport pour avoir des tâches à planifier.'
        );
        return;
      }

      const taches = data.taches || [];
      const evenements = data.agenda?.evenements_proposes || [];

      if (taches.length === 0 && evenements.length === 0) {
        await this.#telegram.sendMessage(
          '✅ <b>Rien à planifier !</b>\n\n' +
          'Aucune tâche ou événement détecté dans le dernier rapport.'
        );
        return;
      }

      const { message, buttons } = this.#formatTasksMessage(taches, evenements);
      await this.#telegram.sendMessage(message, { inlineKeyboard: buttons });
    });
  }

  // ============================================
  // CALLBACKS (Boutons inline)
  // ============================================

  /**
   * Handler pour les clics sur les boutons de tâches
   */
  #registerTaskCallbacks() {
    this.#telegram.onCallback('task_', async (data) => {
      const index = parseInt(data.replace('task_', ''));
      const reportData = this.#cronService.getLastReportData();
      const calendarService = this.#cronService.getCalendarService();

      if (!reportData?.taches?.[index]) {
        await this.#telegram.sendMessage('❌ Tâche introuvable. Regénérez le rapport avec /rapport');
        return;
      }

      if (!calendarService?.isConfigured) {
        await this.#telegram.sendMessage('❌ Google Calendar non configuré');
        return;
      }

      const tache = reportData.taches[index];
      const taskData = {
        summary: tache.titre,
        description: `${tache.description}\n\nPriorité: ${tache.priorite || 'normale'}\nSource: ${tache.source || 'C.A.R.L.'}`
      };

      if (tache.deadline) {
        const parsed = this.#parseDate(tache.deadline, false);
        if (parsed) taskData.dueDate = parsed;
      }

      try {
        const result = await calendarService.createTask(taskData);
        await this.#telegram.sendMessage(
          `✅ <b>Tâche ajoutée à l'agenda !</b>\n\n` +
          `📋 ${tache.titre}\n${result}`
        );
      } catch (error) {
        await this.#telegram.sendMessage(`❌ Erreur: ${error.message}`);
      }
    });
  }

  /**
   * Handler pour les clics sur les boutons d'événements
   */
  #registerEventCallbacks() {
    this.#telegram.onCallback('event_', async (data) => {
      const reportData = this.#cronService.getLastReportData();
      const tachesCount = reportData?.taches?.length || 0;
      const eventIndex = parseInt(data.replace('event_', '')) - tachesCount;
      const calendarService = this.#cronService.getCalendarService();

      if (!reportData?.agenda?.evenements_proposes?.[eventIndex]) {
        await this.#telegram.sendMessage('❌ Événement introuvable. Regénérez le rapport avec /rapport');
        return;
      }

      if (!calendarService?.isConfigured) {
        await this.#telegram.sendMessage('❌ Google Calendar non configuré');
        return;
      }

      const evt = reportData.agenda.evenements_proposes[eventIndex];
      const duration = this.#estimateDuration(evt.activite);

      const eventData = {
        summary: `${evt.activite} avec ${evt.expediteur}`,
        description: `Proposé via WhatsApp\nQuand: ${evt.quand}`,
        duration
      };

      const parsed = this.#parseDate(evt.quand);
      if (parsed) eventData.start = parsed;

      // Vérifier les conflits sur tous les calendriers
      if (eventData.start) {
        const conflictCheck = await calendarService.checkConflicts(eventData.start, duration);
        
        if (conflictCheck.hasConflict) {
          let conflictMsg = `⚠️ <b>Conflit détecté !</b>\n\n`;
          conflictMsg += `L'horaire proposé (${eventData.start.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}) entre en conflit avec:\n\n`;
          
          for (const c of conflictCheck.conflicts) {
            const startStr = c.start.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
            const endStr = c.end.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
            conflictMsg += `📅 <b>${c.summary}</b>\n`;
            conflictMsg += `   ${startStr} - ${endStr} (${c.calendarName})\n\n`;
          }
          
          if (conflictCheck.suggestion) {
            const suggestionStr = conflictCheck.suggestion.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
            conflictMsg += `\n💡 <b>Suggestion:</b> ${suggestionStr} serait disponible`;
          }
          
          await this.#telegram.sendMessage(conflictMsg);
          return;
        }
      }

      try {
        const result = await calendarService.createEvent(eventData);
        await this.#telegram.sendMessage(
          `✅ <b>Événement ajouté à l'agenda !</b>\n\n` +
          `📅 ${evt.activite} avec ${evt.expediteur}\n` +
          `📍 ${evt.quand}\n${result}`
        );
      } catch (error) {
        await this.#telegram.sendMessage(`❌ Erreur: ${error.message}`);
      }
    });
  }

  // ============================================
  // MÉTHODES UTILITAIRES
  // ============================================

  /**
   * Formate le message et les boutons pour /tasks
   * @param {Array} taches - Liste des tâches
   * @param {Array} evenements - Liste des événements
   * @returns {{ message: string, buttons: Array }}
   */
  #formatTasksMessage(taches, evenements) {
    let message = 
      '📋 <b>TÂCHES & ÉVÉNEMENTS À PLANIFIER</b>\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '<i>Cliquez sur un bouton pour ajouter à Google Calendar</i>\n\n';

    const buttons = [];
    let itemIndex = 0;

    // Tâches
    if (taches.length > 0) {
      message += '✅ <b>TÂCHES:</b>\n';
      
      taches.forEach((t) => {
        const prioIcon = { haute: '🔴', moyenne: '🟡', basse: '🟢' }[t.priorite] || '⚪';
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

    // Événements
    if (evenements.length > 0) {
      message += '📅 <b>ÉVÉNEMENTS PROPOSÉS:</b>\n';
      
      evenements.forEach((e) => {
        message += `🗓️ ${e.activite} avec ${e.expediteur}\n`;
        message += `   📍 ${e.quand}\n\n`;

        buttons.push([{
          text: `📅 ${e.activite} - ${e.quand}`.substring(0, 40),
          callback_data: `event_${itemIndex}`
        }]);
        itemIndex++;
      });
    }

    return { message, buttons };
  }

  /**
   * Parse une date en français vers un objet Date
   * @param {string} dateStr - La chaîne de date à parser
   * @param {boolean} correctTimezone - Si true, corrige le décalage horaire UTC -> Europe/Zurich
   * @returns {Date|null}
   */
  #parseDate(dateStr, correctTimezone = true) {
    if (!dateStr) return null;

    const now = new Date();
    const lower = dateStr.toLowerCase();
    let targetDate = new Date(now);
    let isToday = true; // Par défaut, on considère que c'est aujourd'hui

    // Chercher un jour de la semaine
    for (let i = 0; i < JOURS_SEMAINE.length; i++) {
      if (lower.includes(JOURS_SEMAINE[i]) || lower.includes(JOURS_SEMAINE_SHORT[i])) {
        const currentDay = now.getDay();
        let daysToAdd = i - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        targetDate.setDate(now.getDate() + daysToAdd);
        isToday = false;
        break;
      }
    }

    // Mots-clés temporels
    if (lower.includes('demain')) {
      targetDate.setDate(now.getDate() + 1);
      isToday = false;
    }
    if (lower.includes("aujourd'hui")) {
      targetDate = new Date(now);
      isToday = true;
    }

    // "Ce soir" = aujourd'hui à 20h par défaut
    const isCeSoir = lower.includes('ce soir') || lower.includes('soir');
    const isMatin = lower.includes('matin');
    if (isCeSoir) {
      targetDate = new Date(now);
      isToday = true;
    }

    // Parser l'heure (ex: "20h", "20h30", "14:30")
    const heureMatch = lower.match(/(\d{1,2})[h:](\d{2})?/);
    if (heureMatch) {
      let hours = parseInt(heureMatch[1]);
      const minutes = parseInt(heureMatch[2] || '0');

      // Correction timezone: Docker UTC -> Europe/Zurich (UTC+1)
      if (correctTimezone) {
        hours = hours - 1;
        if (hours < 0) hours += 24;
      }

      targetDate.setHours(hours, minutes, 0, 0);
    } else if (isCeSoir) {
      // "Ce soir" sans heure précise = 20h par défaut
      targetDate.setHours(correctTimezone ? 19 : 20, 0, 0, 0);
    } else if (isMatin) {
      // "Matin" sans heure précise = 10h par défaut
      targetDate.setHours(correctTimezone ? 9 : 10, 0, 0, 0);
    } else if (isToday) {
      // Pour aujourd'hui sans heure précise: heure actuelle + 45 minutes
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 0, 45, 0, 0);
      targetDate = nextHour;
    } else {
      // Pour les autres jours sans heure: 10h du matin par défaut
      targetDate.setHours(correctTimezone ? 9 : 10, 0, 0, 0);
    }

    return targetDate;
  }

  /**
   * Estime la durée d'une activité en minutes
   * @param {string} activite - Nom de l'activité
   * @returns {number} Durée en minutes
   */
  #estimateDuration(activite) {
    const activiteLower = (activite || '').toLowerCase();
    
    for (const [keyword, duration] of Object.entries(ACTIVITY_DURATIONS)) {
      if (activiteLower.includes(keyword)) {
        return duration;
      }
    }
    
    return 90; // Durée par défaut
  }

  /**
   * Obtient le timestamp de minuit (début de journée)
   * @returns {number}
   */
  #getMidnightTimestamp() {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return midnight.getTime();
  }

  /**
   * Formate la durée d'uptime
   * @param {number} seconds - Secondes
   * @returns {string}
   */
  #formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
}
