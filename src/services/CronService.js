import { CronJob } from 'cron';

export class CronService {
  #job;
  #repo;
  #telegram;
  #logger;
  #config;
  #aiService;
  #calendarService;
  
  // Stockage des dernières données pour /tasks
  #lastReportData = null;

  constructor(config, repository, telegramService, logger, aiService = null, calendarService = null) {
    this.#config = config;
    this.#repo = repository;
    this.#telegram = telegramService;
    this.#logger = logger;
    this.#aiService = aiService;
    this.#calendarService = calendarService;
    this.init();
  }

  /**
   * Retourne les tâches et événements du dernier rapport
   */
  getLastReportData() {
    return this.#lastReportData;
  }

  /**
   * Retourne le CalendarService pour créer des événements
   */
  getCalendarService() {
    return this.#calendarService;
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
   * Couvre les messages de la journée en cours (depuis minuit)
   */
  async generateAndSendReport() {
    this.#logger.info('Generating report...');

    // Récupérer les stats rapides (journée en cours)
    const stats = this.#repo.getQuickStats();
    
    // Récupérer les conversations groupées par contact (nouveau format)
    const conversations = this.#repo.getConversationsForReport();

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
      // Générer le rapport avec IA (retourne { formatted, raw })
      const result = await this.#aiService.generateFullReport(conversations, stats, agendaSummary, this.#calendarService);
      report = result.formatted;
      
      // Stocker les données brutes pour /tasks
      this.#lastReportData = result.raw;
    } else {
      // Fallback sans IA
      report = this.#formatBasicReport(stats);
      this.#lastReportData = null;
    }

    await this.#telegram.sendMessage(report);
    this.#logger.info('Report sent', { conversationsCount: conversations.length });
    
    return report;
  }

  #formatBasicReport(stats) {
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
