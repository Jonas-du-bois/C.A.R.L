/**
 * TelegramCommandHandler - Gère toutes les commandes Telegram pour C.A.R.L.
 * 
 * Ce handler centralise la logique des commandes Telegram, permettant
 * à Application.js de rester léger et focalisé sur l'orchestration.
 * 
 * @module handlers/TelegramCommandHandler
 */

import { escapeHtml } from '../utils/Sanitizer.js';

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
    this.#registerBriefCommand();
    this.#registerStatsCommand();
    this.#registerStatusCommand();
    this.#registerConnectCommand();
    this.#registerResetCommand();
    this.#registerHelpCommand();
    this.#registerDebugCommand();
    this.#registerTasksCommand();
    this.#registerTaskCallbacks();
    this.#registerEventCallbacks();
    this.#registerConfirmCallbacks();     // Nouveau: confirmation d'événements
    this.#registerCalendarCallbacks();    // Nouveau: sélection de calendrier
    this.#registerEditCallbacks();        // Nouveau: modification d'événements
    this.#registerTitleInputHandler();    // Nouveau: capture du nouveau titre

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
   * /brief - Résumé court et essentiel de la journée
   */
  #registerBriefCommand() {
    this.#telegram.onCommand('brief', async () => {
      await this.#telegram.sendMessage('⏳ Génération du résumé express...');
      
      try {
        const briefReport = await this.#generateBriefReport();
        await this.#telegram.sendMessage(briefReport);
      } catch (error) {
        await this.#telegram.sendMessage(`❌ Erreur: ${error.message}`);
      }
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
        ? Object.entries(stats.byCategory).map(([k, v]) => `• ${escapeHtml(k)}: ${v}`).join('\n')
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
        '/brief - ⚡ Résumé express (essentiel)\n' +
        '/rapport - 📋 Rapport complet avec IA\n' +
        '/stats - 📈 Statistiques rapides\n\n' +
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
              `   De: ${escapeHtml(phone)}\n` +
              `   Msg: "${escapeHtml(bodyPreview)}${truncated}"\n` +
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
   * Affiche maintenant une confirmation interactive au lieu de créer directement
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
        duration,
        originalEvent: evt
      };

      const parsed = this.#parseDate(evt.quand);
      if (parsed) eventData.start = parsed;

      // Vérifier les conflits sur tous les calendriers
      if (eventData.start) {
        const conflictCheck = await calendarService.checkConflicts(eventData.start, duration);
        eventData.hasConflict = conflictCheck.hasConflict;
        eventData.conflicts = conflictCheck.conflicts;
        eventData.suggestion = conflictCheck.suggestion;
      }

      // Stocker l'événement en attente et afficher la confirmation
      const eventId = this.#telegram.storePendingEvent(eventData);
      await this.#showEventConfirmation(eventId, eventData);
    });
  }

  /**
   * Affiche le message de confirmation avec les détails de l'événement
   */
  async #showEventConfirmation(eventId, eventData) {
    const calendarService = this.#cronService.getCalendarService();
    
    let message = `📅 <b>CONFIRMER L'ÉVÉNEMENT</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `📌 <b>Titre:</b> ${escapeHtml(eventData.summary)}\n`;
    
    if (eventData.start) {
      const dateStr = eventData.start.toLocaleDateString('fr-CH', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
      });
      const timeStr = eventData.start.toLocaleTimeString('fr-CH', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      message += `📆 <b>Date:</b> ${dateStr}\n`;
      message += `⏰ <b>Heure:</b> ${timeStr}\n`;
    } else {
      message += `📆 <b>Quand:</b> ${eventData.originalEvent?.quand || 'Non défini'}\n`;
    }
    
    message += `⏱️ <b>Durée:</b> ${eventData.duration} minutes\n\n`;

    // Afficher les conflits si présents
    if (eventData.hasConflict && eventData.conflicts?.length > 0) {
      message += `⚠️ <b>CONFLIT DÉTECTÉ:</b>\n`;
      for (const c of eventData.conflicts) {
        const startStr = c.start.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
        const endStr = c.end.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
        message += `   • ${escapeHtml(c.summary)} (${startStr} - ${endStr})\n`;
      }
      if (eventData.suggestion) {
        const suggestionStr = eventData.suggestion.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
        message += `\n💡 <b>Suggestion:</b> ${suggestionStr} serait disponible\n`;
      }
      message += '\n';
    } else if (eventData.start) {
      message += `✅ <b>Pas de conflit détecté</b>\n\n`;
    }

    // Boutons d'action
    const buttons = [
      [
        { text: '✅ Confirmer', callback_data: `confirm_${eventId}` },
        { text: '📅 Calendrier', callback_data: `calendar_${eventId}` }
      ],
      [
        { text: '✏️ Modifier date', callback_data: `editdate_${eventId}` },
        { text: '✏️ Modifier heure', callback_data: `edittime_${eventId}` }
      ],
      [
        { text: '✏️ Modifier titre', callback_data: `edittitle_${eventId}` },
        { text: '❌ Annuler', callback_data: `cancel_${eventId}` }
      ]
    ];

    // Ajouter bouton suggestion si conflit
    if (eventData.hasConflict && eventData.suggestion) {
      buttons.splice(1, 0, [
        { text: `💡 Utiliser ${eventData.suggestion.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}`, callback_data: `usesugg_${eventId}` }
      ]);
    }

    await this.#telegram.sendMessage(message, { inlineKeyboard: buttons });
  }

  /**
   * Handlers pour la confirmation d'événements
   */
  #registerConfirmCallbacks() {
    // Confirmer l'événement
    this.#telegram.onCallback('confirm_', async (data) => {
      const eventId = data.replace('confirm_', '');
      const pending = this.#telegram.getPendingEvent(eventId);
      
      if (!pending) {
        await this.#telegram.sendMessage('❌ Événement expiré. Utilisez /tasks pour recommencer.');
        return;
      }

      const calendarService = this.#cronService.getCalendarService();
      const calendarId = pending.calendarId || this.#config.google.calendarId;
      
      try {
        const result = await calendarService.createEvent({
          ...pending.event,
          calendarId
        });
        
        await this.#telegram.sendMessage(
          `✅ <b>Événement créé !</b>\n\n` +
          `📅 ${pending.event.summary}\n` +
          `${result}`
        );
        
        this.#telegram.removePendingEvent(eventId);
      } catch (error) {
        await this.#telegram.sendMessage(`❌ Erreur: ${error.message}`);
      }
    });

    // Annuler l'événement
    this.#telegram.onCallback('cancel_', async (data) => {
      const eventId = data.replace('cancel_', '');
      this.#telegram.removePendingEvent(eventId);
      await this.#telegram.sendMessage('❌ Événement annulé.');
    });

    // Utiliser la suggestion de créneau
    this.#telegram.onCallback('usesugg_', async (data) => {
      const eventId = data.replace('usesugg_', '');
      const pending = this.#telegram.getPendingEvent(eventId);
      
      if (!pending || !pending.event.suggestion) {
        await this.#telegram.sendMessage('❌ Événement expiré ou pas de suggestion.');
        return;
      }

      // Mettre à jour l'heure avec la suggestion
      pending.event.start = pending.event.suggestion;
      pending.event.hasConflict = false;
      pending.event.conflicts = [];
      
      this.#telegram.updatePendingEvent(eventId, pending);
      await this.#showEventConfirmation(eventId, pending.event);
    });
  }

  /**
   * Handlers pour la sélection de calendrier
   */
  #registerCalendarCallbacks() {
    // Afficher la liste des calendriers
    this.#telegram.onCallback('calendar_', async (data) => {
      const eventId = data.replace('calendar_', '');
      const pending = this.#telegram.getPendingEvent(eventId);
      
      if (!pending) {
        await this.#telegram.sendMessage('❌ Événement expiré. Utilisez /tasks pour recommencer.');
        return;
      }

      const calendarService = this.#cronService.getCalendarService();
      let calendars = await calendarService.getCalendarList();
      
      // Si aucun calendrier trouvé via l'API, utiliser le calendrier par défaut configuré
      if (calendars.length === 0) {
        const defaultCalendarId = this.#config.google?.calendarId;
        if (defaultCalendarId) {
          calendars = [{
            id: defaultCalendarId,
            name: 'Calendrier principal',
            primary: true,
            accessRole: 'owner'
          }];
        } else {
          await this.#telegram.sendMessage(
            '❌ <b>Aucun calendrier disponible</b>\n\n' +
            'Vérifiez que les calendriers sont partagés avec le service account Google.\n' +
            'L\'événement sera créé dans le calendrier par défaut.'
          );
          return;
        }
      }

      let message = `📅 <b>CHOISIR LE CALENDRIER</b>\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      message += `Pour: <b>${pending.event.summary}</b>\n\n`;

      const buttons = calendars.map((cal, i) => {
        const icon = cal.primary ? '⭐' : '📅';
        return [{ 
          text: `${icon} ${cal.name}`, 
          callback_data: `selectcal_${eventId}_${i}` 
        }];
      });
      
      buttons.push([{ text: '⬅️ Retour', callback_data: `back_${eventId}` }]);

      await this.#telegram.sendMessage(message, { inlineKeyboard: buttons });
      
      // Stocker la liste des calendriers pour référence
      this.#telegram.updatePendingEvent(eventId, { 
        ...pending, 
        availableCalendars: calendars 
      });
    });

    // Sélectionner un calendrier spécifique
    this.#telegram.onCallback('selectcal_', async (data) => {
      const parts = data.replace('selectcal_', '').split('_');
      const eventId = parts[0];
      const calendarIndex = parseInt(parts[1]);
      
      const pending = this.#telegram.getPendingEvent(eventId);
      
      if (!pending || !pending.availableCalendars?.[calendarIndex]) {
        await this.#telegram.sendMessage('❌ Sélection invalide.');
        return;
      }

      const selectedCalendar = pending.availableCalendars[calendarIndex];
      this.#telegram.updatePendingEvent(eventId, { 
        ...pending, 
        calendarId: selectedCalendar.id,
        calendarName: selectedCalendar.name 
      });

      await this.#telegram.sendMessage(
        `✅ Calendrier sélectionné: <b>${selectedCalendar.name}</b>\n\n` +
        `Cliquez sur ✅ Confirmer pour créer l'événement.`
      );
      
      // Ré-afficher la confirmation avec le calendrier sélectionné
      const updatedPending = this.#telegram.getPendingEvent(eventId);
      await this.#showEventConfirmation(eventId, updatedPending.event);
    });

    // Retour à la confirmation
    this.#telegram.onCallback('back_', async (data) => {
      const eventId = data.replace('back_', '');
      const pending = this.#telegram.getPendingEvent(eventId);
      
      if (!pending) {
        await this.#telegram.sendMessage('❌ Événement expiré.');
        return;
      }

      await this.#showEventConfirmation(eventId, pending.event);
    });
  }

  /**
   * Handlers pour la modification d'événements
   */
  #registerEditCallbacks() {
    // Modifier la date
    this.#telegram.onCallback('editdate_', async (data) => {
      const eventId = data.replace('editdate_', '');
      const pending = this.#telegram.getPendingEvent(eventId);
      
      if (!pending) {
        await this.#telegram.sendMessage('❌ Événement expiré.');
        return;
      }

      // Proposer les prochains jours
      const buttons = [];
      const today = new Date();
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dayStr = date.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' });
        const label = i === 0 ? `📅 Aujourd'hui (${dayStr})` : 
                      i === 1 ? `📅 Demain (${dayStr})` : `📅 ${dayStr}`;
        
        buttons.push([{ 
          text: label, 
          callback_data: `setdate_${eventId}_${i}` 
        }]);
      }
      
      buttons.push([{ text: '⬅️ Retour', callback_data: `back_${eventId}` }]);

      await this.#telegram.sendMessage(
        `📆 <b>CHOISIR LA DATE</b>\n\n` +
        `Pour: <b>${pending.event.summary}</b>`,
        { inlineKeyboard: buttons }
      );
    });

    // Appliquer la nouvelle date
    this.#telegram.onCallback('setdate_', async (data) => {
      const parts = data.replace('setdate_', '').split('_');
      const eventId = parts[0];
      const daysOffset = parseInt(parts[1]);
      
      const pending = this.#telegram.getPendingEvent(eventId);
      if (!pending) {
        await this.#telegram.sendMessage('❌ Événement expiré.');
        return;
      }

      const newDate = new Date();
      newDate.setDate(newDate.getDate() + daysOffset);
      
      // Conserver l'heure si elle existe
      if (pending.event.start) {
        newDate.setHours(pending.event.start.getHours(), pending.event.start.getMinutes(), 0, 0);
      } else {
        newDate.setHours(10, 0, 0, 0); // Défaut: 10h
      }
      
      pending.event.start = newDate;
      
      // Revérifier les conflits
      const calendarService = this.#cronService.getCalendarService();
      const conflictCheck = await calendarService.checkConflicts(newDate, pending.event.duration);
      pending.event.hasConflict = conflictCheck.hasConflict;
      pending.event.conflicts = conflictCheck.conflicts;
      pending.event.suggestion = conflictCheck.suggestion;
      
      this.#telegram.updatePendingEvent(eventId, pending);
      await this.#showEventConfirmation(eventId, pending.event);
    });

    // Modifier l'heure
    this.#telegram.onCallback('edittime_', async (data) => {
      const eventId = data.replace('edittime_', '');
      const pending = this.#telegram.getPendingEvent(eventId);
      
      if (!pending) {
        await this.#telegram.sendMessage('❌ Événement expiré.');
        return;
      }

      // Proposer des créneaux horaires courants
      const timeSlots = [
        { label: '🌅 8h00', hour: 8, min: 0 },
        { label: '🌅 9h00', hour: 9, min: 0 },
        { label: '☀️ 10h00', hour: 10, min: 0 },
        { label: '☀️ 11h00', hour: 11, min: 0 },
        { label: '🍽️ 12h00', hour: 12, min: 0 },
        { label: '☀️ 14h00', hour: 14, min: 0 },
        { label: '☀️ 15h00', hour: 15, min: 0 },
        { label: '☀️ 16h00', hour: 16, min: 0 },
        { label: '🌆 17h00', hour: 17, min: 0 },
        { label: '🌆 18h00', hour: 18, min: 0 },
        { label: '🌙 19h00', hour: 19, min: 0 },
        { label: '🌙 20h00', hour: 20, min: 0 },
        { label: '🌙 21h00', hour: 21, min: 0 }
      ];

      // Grouper par 3
      const buttons = [];
      for (let i = 0; i < timeSlots.length; i += 3) {
        const row = timeSlots.slice(i, i + 3).map(slot => ({
          text: slot.label,
          callback_data: `settime_${eventId}_${slot.hour}_${slot.min}`
        }));
        buttons.push(row);
      }
      
      buttons.push([{ text: '⬅️ Retour', callback_data: `back_${eventId}` }]);

      await this.#telegram.sendMessage(
        `⏰ <b>CHOISIR L'HEURE</b>\n\n` +
        `Pour: <b>${pending.event.summary}</b>`,
        { inlineKeyboard: buttons }
      );
    });

    // Appliquer la nouvelle heure
    this.#telegram.onCallback('settime_', async (data) => {
      const parts = data.replace('settime_', '').split('_');
      const eventId = parts[0];
      const hour = parseInt(parts[1]);
      const min = parseInt(parts[2]);
      
      const pending = this.#telegram.getPendingEvent(eventId);
      if (!pending) {
        await this.#telegram.sendMessage('❌ Événement expiré.');
        return;
      }

      if (!pending.event.start) {
        pending.event.start = new Date();
      }
      
      // Correction timezone: Docker UTC -> Europe/Zurich (UTC+1)
      pending.event.start.setHours(hour - 1, min, 0, 0);
      
      // Revérifier les conflits
      const calendarService = this.#cronService.getCalendarService();
      const conflictCheck = await calendarService.checkConflicts(pending.event.start, pending.event.duration);
      pending.event.hasConflict = conflictCheck.hasConflict;
      pending.event.conflicts = conflictCheck.conflicts;
      pending.event.suggestion = conflictCheck.suggestion;
      
      this.#telegram.updatePendingEvent(eventId, pending);
      await this.#showEventConfirmation(eventId, pending.event);
    });

    // Modifier le titre
    this.#telegram.onCallback('edittitle_', async (data) => {
      const eventId = data.replace('edittitle_', '');
      const pending = this.#telegram.getPendingEvent(eventId);
      
      if (!pending) {
        await this.#telegram.sendMessage('❌ Événement expiré.');
        return;
      }

      // Marquer qu'on attend un nouveau titre
      this.#telegram.updatePendingEvent(eventId, { ...pending, step: 'edit_title' });
      
      await this.#telegram.sendMessage(
        `✏️ <b>MODIFIER LE TITRE</b>\n\n` +
        `Titre actuel: <b>${pending.event.summary}</b>\n\n` +
        `Envoyez le nouveau titre en réponse.\n\n` +
        `💡 <i>Ou cliquez sur Retour pour annuler.</i>`,
        { inlineKeyboard: [[{ text: '⬅️ Retour', callback_data: `back_${eventId}` }]] }
      );
    });
  }

  /**
   * Handler pour la capture du nouveau titre (message texte non-commande)
   */
  #registerTitleInputHandler() {
    this.#telegram.onCallback('title_input_', async (newTitle, eventId) => {
      const pending = this.#telegram.getPendingEvent(eventId);
      
      if (!pending || pending.step !== 'edit_title') {
        return; // Ignorer si pas en mode édition
      }

      // Mettre à jour le titre
      pending.event.summary = newTitle;
      pending.step = 'confirm'; // Revenir au mode confirmation
      
      this.#telegram.updatePendingEvent(eventId, pending);
      
      await this.#telegram.sendMessage(`✅ Titre modifié: <b>${escapeHtml(newTitle)}</b>`);
      await this.#showEventConfirmation(eventId, pending.event);
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
        message += `${prioIcon} ${escapeHtml(t.titre)}\n`;
        if (t.deadline) message += `   ⏰ ${escapeHtml(t.deadline)}\n`;
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
        message += `🗓️ ${escapeHtml(e.activite)} avec ${escapeHtml(e.expediteur)}\n`;
        message += `   📍 ${escapeHtml(e.quand)}\n\n`;

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

  /**
   * Génère un rapport court et essentiel
   * @returns {string} Rapport formaté
   */
  async #generateBriefReport() {
    const stats = this.#messageRepo.getQuickStats();
    const conversations = this.#messageRepo.getConversationsForReport(5) || [];
    const calendarService = this.#cronService.getCalendarService();
    
    const now = new Date().toLocaleDateString('fr-CH', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    let brief = `⚡ <b>RÉSUMÉ EXPRESS</b>\n`;
    brief += `📅 ${now}\n`;
    brief += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Stats rapides
    const total = (stats?.received || 0) + (stats?.sent || 0);
    brief += `📊 <b>Activité:</b> ${total} messages (${stats?.received || 0}↓ ${stats?.sent || 0}↑)\n`;
    brief += `👥 <b>Contacts:</b> ${stats?.contacts || 0} actifs\n\n`;

    // Messages urgents/importants
    if (conversations && conversations.length > 0) {
      const urgentConvs = conversations.filter(c => 
        c.stats?.urgencies?.high || c.stats?.urgencies?.critical
      );
      
      if (urgentConvs.length > 0) {
        brief += `🚨 <b>URGENT (${urgentConvs.length}):</b>\n`;
        urgentConvs.slice(0, 3).forEach(c => {
          const lastMsg = c.messages?.[c.messages.length - 1];
          const preview = (lastMsg?.body || '').substring(0, 60);
          brief += `• ${escapeHtml(c.contactName)}: "${escapeHtml(preview)}${preview.length >= 60 ? '...' : ''}"\n`;
        });
        brief += '\n';
      }

      // Top 5 contacts les plus actifs avec aperçu
      brief += `💬 <b>CONVERSATIONS:</b>\n`;
      conversations.slice(0, 5).forEach(c => {
        const lastMsg = c.messages?.[c.messages.length - 1];
        const preview = (lastMsg?.body || '').substring(0, 40);
        const icon = lastMsg?.direction === 'outgoing' ? '↩️' : '💬';
        brief += `${icon} <b>${escapeHtml(c.contactName)}</b> (${c.messages?.length || 0})\n`;
        brief += `   └ "${escapeHtml(preview)}${preview.length >= 40 ? '...' : ''}"\n`;
      });
      brief += '\n';
    } else {
      brief += `💬 <b>CONVERSATIONS:</b> Aucune aujourd'hui\n\n`;
    }

    // Prochains événements agenda
    if (calendarService?.isConfigured) {
      try {
        const events = await calendarService.getUpcomingEvents(2);
        if (events.length > 0) {
          brief += `📅 <b>AGENDA:</b>\n`;
          events.slice(0, 4).forEach(e => {
            const start = new Date(e.start?.dateTime || e.start?.date);
            const timeStr = start.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
            const dayStr = start.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric' });
            brief += `• ${dayStr} ${timeStr} - ${escapeHtml(e.summary)}\n`;
          });
          brief += '\n';
        }
      } catch (e) {
        // Ignorer les erreurs calendar
      }
    }

    // Actions suggérées
    const lastReport = this.#cronService.getLastReportData();
    const pendingTasks = lastReport?.taches?.length || 0;
    const pendingEvents = lastReport?.agenda?.evenements_proposes?.length || 0;
    
    if (pendingTasks > 0 || pendingEvents > 0) {
      brief += `✅ <b>À FAIRE:</b>\n`;
      if (pendingTasks > 0) brief += `• ${pendingTasks} tâche(s) en attente\n`;
      if (pendingEvents > 0) brief += `• ${pendingEvents} événement(s) à planifier\n`;
      brief += `→ /tasks pour gérer\n`;
    }

    brief += `\n💡 /rapport pour le détail complet`;

    return brief;
  }
}
