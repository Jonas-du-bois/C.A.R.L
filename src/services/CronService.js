import { CronJob } from 'cron';

export class CronService {
  #job;
  #repo;
  #telegram;
  #logger;
  #config;

  constructor(config, repository, telegramService, logger) {
    this.#config = config;
    this.#repo = repository;
    this.#telegram = telegramService;
    this.#logger = logger;
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

  async generateAndSendReport() {
    const yesterday = new Date(Date.now() - 86400000);
    const dateStr = yesterday.toISOString().split('T')[0];

    const stats = this.#repo.generateDailyStats(dateStr);

    const report = `📊 Daily Report for ${yesterday.toLocaleDateString()}

Total Messages: ${stats.total || 0}
🚨 Urgent: ${stats.urgent || 0}
💼 Professional: ${stats.professional || 0}
🏠 Personal: ${stats.personal || 0}
🗑️ Spam: ${stats.spam || 0}`;

    this.#logger.info('Generated daily report', { stats });
    await this.#telegram.sendMessage(report);
  }
}
