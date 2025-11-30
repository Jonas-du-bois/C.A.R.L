export class MessageHandler {
  #gatekeeper;
  #openAI;
  #calendar;
  #repo;
  #whatsapp;
  #logger;

  constructor({ gatekeeper, openAI, calendar, repository, whatsapp, logger }) {
    this.#gatekeeper = gatekeeper;
    this.#openAI = openAI;
    this.#calendar = calendar;
    this.#repo = repository;
    this.#whatsapp = whatsapp;
    this.#logger = logger;
  }

  async handle(rawMessage) {
    try {
      if (!this.#gatekeeper.shouldProcess(rawMessage)) {
        this.#logger.warn('Message filtered by gatekeeper', { from: rawMessage.from });
        return;
      }

      await this.#whatsapp.sendStateTyping(rawMessage.from);

      const context = this.#repo.findRecent(rawMessage.from, 3);
      const analysis = await this.#openAI.analyzeMessage(rawMessage, context);

      if (analysis.action === 'calendar_event') {
        await this.#calendar.createEvent(rawMessage.body);
      }

      await this.#whatsapp.sendMessage(rawMessage.from, analysis.reply);
      this.#repo.save(rawMessage);

      this.#logger.info('Message processed', { from: rawMessage.from, action: analysis.action });
    } catch (error) {
      this.#logger.error('Failed to handle message', { error });
    }
  }
}
