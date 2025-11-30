import { CronJob } from 'cron';

export class CronService {
  #job;
  #repo;
  #telegram;
  #logger;
  #config;
  #aiService;
  #calendarService;

  constructor(config, repository, telegramService, logger, aiService = null, calendarService = null) {
    this.#config = config;
    this.#repo = repository;
    this.#telegram = telegramService;
    this.#logger = logger;
    this.#aiService = aiService;
    this.#calendarService = calendarService;
    this.init();
  }

  init() {
    if (!this.#config.features.enableDailyBriefing) {
      this.#logger.info('Daily briefing disabled');
      return;
    }

    const time = this.#config.features.dailyBriefingTime;
    this.#logger.info(`Scheduling daily briefing at ${time}`);

    this.#job = new CronJob(time, async () => {
      try {
        await this.generateAndSendReport();
      } catch (error) {
        this.#logger.error('Failed to generate daily briefing', { error });
      }
    });

    this.#job.start();
  }

  /**
   * Génère et envoie le rapport - appelable manuellement ou par cron
   * @param {number} hoursAgo - Période à couvrir (défaut: 24h)
   */
  async generateAndSendReport(hoursAgo = 24) {
    this.#logger.info('Generating report...', { hoursAgo });

    // Récupérer les stats rapides (sans IA)
    const stats = this.#repo.getQuickStats(hoursAgo);
    
    // Récupérer tous les messages de la période
    const messages = this.#repo.getMessagesForReport(hoursAgo);

    // Récupérer le résumé de l'agenda si disponible
    let agendaSummary = null;
    if (this.#calendarService?.isConfigured) {
      try {
        agendaSummary = await this.#calendarService.getAgendaSummary();
      } catch (error) {
        this.#logger.error('Failed to get agenda summary', { error: error.message });
      }
    }

    let report;
    
    if (this.#aiService) {
      // Générer le rapport avec IA (1 seule requête pour tous les messages)
      report = await this.#aiService.generateFullReport(messages, stats, agendaSummary, this.#calendarService);
    } else {
      // Fallback sans IA
      report = this.#formatBasicReport(stats, messages);
    }

    await this.#telegram.sendMessage(report);
    this.#logger.info('Report sent', { messagesCount: messages.length });
    
    return report;
  }

  #formatBasicReport(stats, messages) {
    let report = `📊 <b>Rapport C.A.R.L.</b>\n\n`;
    report += `📈 <b>Statistiques:</b>\n`;
    report += `• Messages reçus: ${stats.received}\n`;
    report += `• Réponses: ${stats.sent}\n`;
    report += `• Contacts: ${stats.contacts}\n`;
    
    if (stats.errors > 0) {
      report += `• ⚠️ Erreurs: ${stats.errors}\n`;
    }

    return report;
  }
}
