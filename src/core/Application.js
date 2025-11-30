import { Config } from './Config.js';
import { Logger } from '../utils/Logger.js';
import { SQLiteDatabase } from '../repositories/Database.js';
import { MessageRepository } from '../repositories/MessageRepository.js';
import { OpenAIService } from '../services/OpenAIService.js';
import { WhatsAppService } from '../services/WhatsAppService.js';
import { CalendarService } from '../services/CalendarService.js';
import { TelegramService } from '../services/TelegramService.js';
import { CronService } from '../services/CronService.js';
import { MessageHandler } from '../handlers/MessageHandler.js';
import { GatekeeperHandler } from '../handlers/GatekeeperHandler.js';
import { Message } from '../domain/Message.js';

export class Application {
  #config;
  #logger;
  #db;
  #whatsapp;

  constructor() {
    this.#config = new Config();
    this.#logger = new Logger();
    this.#db = new SQLiteDatabase(this.#config);
  }

  async start() {
    try {
      const messageRepo = new MessageRepository(this.#db);
      const openAIService = new OpenAIService(this.#config);
      const calendarService = new CalendarService(this.#config);
      const telegramService = new TelegramService(this.#config);
      const cronService = new CronService(this.#config, messageRepo, telegramService, this.#logger);

      this.#whatsapp = new WhatsAppService(this.#config);
      const gatekeeper = new GatekeeperHandler();

      const messageHandler = new MessageHandler({
        gatekeeper,
        openAI: openAIService,
        calendar: calendarService,
        repository: messageRepo,
        whatsapp: this.#whatsapp,
        logger: this.#logger
      });

      this.#whatsapp.on('qr', (qr) => {
        this.#logger.info('QR Code received', { qr });
        this.#logger.info('QR Code String', { qrString: qr });
      });

      this.#whatsapp.on('ready', () => {
        this.#logger.info('WhatsApp client is ready');
      });

      this.#whatsapp.on('message', async (msg) => {
        const message = new Message({
          id: msg.id.id,
          from: msg.from,
          body: msg.body,
          timestamp: msg.timestamp * 1000
        });
        await messageHandler.handle(message);
      });

      await this.#whatsapp.initialize();
    } catch (error) {
      this.#logger.error('Application failed to start', { error });
      process.exit(1);
    }
  }
}
