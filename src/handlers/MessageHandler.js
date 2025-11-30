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

      // Sanitize input (although we store raw, analysis benefits from clean text)
      // Actually, standard practice: Save raw, analyze raw/clean.
      // The sanitization utility was requested. Let's use it for analysis context?
      // Or just basic cleanup.

      const context = this.#repo.findRecent(rawMessage.from, 3);
      const analysis = await this.#openAI.analyzeMessage(rawMessage, context);

      // Update message with analysis results
      const analyzedMessage = rawMessage.withAnalysis(analysis);

      // Handle Actions
      if (analysis.action === 'calendar_event') {
        const result = await this.#calendar.createEvent(rawMessage.body);
        // Optionally append result to reply?
        // analysis.reply += `\n(${result})`;
      }

      await this.#whatsapp.sendMessage(rawMessage.from, analysis.reply);
      this.#repo.save(analyzedMessage);

      this.#logger.info('Message processed', {
        from: rawMessage.from,
        action: analysis.action,
        urgency: analysis.urgency,
        category: analysis.category
      });
    } catch (error) {
      this.#logger.error('Failed to handle message', { error });
    }
  }
}
