import { escapeHtml } from '../utils/Sanitizer.js';

export class MessageHandler {
  #gatekeeper;
  #openAI;
  #calendar;
  #repo;
  #whatsapp;
  #logger;
  #telegram;

  constructor({ gatekeeper, openAI, calendar, repository, whatsapp, logger, telegram }) {
    this.#gatekeeper = gatekeeper;
    this.#openAI = openAI;
    this.#calendar = calendar;
    this.#repo = repository;
    this.#whatsapp = whatsapp;
    this.#logger = logger;
    this.#telegram = telegram;
  }

  async handle(rawMessage, messageMetadata = {}) {
    let messageDbId = null;
    let contact = null;
    const startTime = Date.now();

    try {
      // ============================================
      // ÉTAPE 1: Vérification Gatekeeper
      // ============================================
      if (!this.#gatekeeper.shouldProcess(rawMessage)) {
        this.#logger.warn('Message filtered by gatekeeper', { from: rawMessage.from });
        return;
      }

      // ============================================
      // ÉTAPE 2: Sauvegarder contact et message AVANT traitement IA
      // ============================================
      contact = this.#repo.findOrCreateContact(rawMessage.from, {
        pushName: messageMetadata.pushName,
        displayName: messageMetadata.displayName,
        isGroup: messageMetadata.isGroup
      }, { incrementReceived: true }); // ⚡ Bolt: Atomically increment stats

      // ⚡ Bolt: Fetch context BEFORE saving current message to avoid duplication in AI context
      const context = this.#repo.findRecentByContactId(contact.id, rawMessage.from, 5);

      messageDbId = this.#repo.saveIncomingMessage(rawMessage, contact.id, {
        mediaType: messageMetadata.mediaType,
        mediaUrl: messageMetadata.mediaUrl,
        isForwarded: messageMetadata.isForwarded,
        isBroadcast: messageMetadata.isBroadcast,
        quotedMessageId: messageMetadata.quotedMessageId,
        skipStatsUpdate: true // ⚡ Bolt: Stats already updated in findOrCreateContact
      });

      this.#logger.info('Message saved to database', {
        messageDbId,
        contactId: contact.id,
        from: rawMessage.from
      });

      // ============================================
      // ÉTAPE 3 & 4: Traitement IA et Simulation de frappe EN PARALLÈLE
      // ⚡ Bolt: Optimized to run typing simulation and AI analysis concurrently
      // ============================================

      const typingPromise = this.#simulateTyping(rawMessage.from, rawMessage.body.length);
      const analysisPromise = this.#openAI.analyzeMessage(rawMessage, context);

      const [_, analysis] = await Promise.all([typingPromise, analysisPromise]);
      const processingTime = Date.now() - startTime;

      // ============================================
      // ÉTAPE 6: Gérer les actions
      // ============================================
      await this.#handleActions(analysis, rawMessage, messageDbId);

      // ============================================
      // ÉTAPE 7: Envoyer la réponse
      // ============================================
      const sentMessage = await this.#whatsapp.sendMessage(rawMessage.from, analysis.reply);

      // ============================================
      // ÉTAPE 5 (Moved): Sauvegarder l'analyse IA
      // ⚡ Bolt: Moved after sendMessage to reduce perceived latency
      // ============================================
      this.#repo.saveAnalysis(messageDbId, {
        intent: analysis.intent,
        urgency: analysis.urgency,
        category: analysis.category,
        sentiment: analysis.sentiment,
        confidence: analysis.confidence,
        keywords: analysis.keywords,
        entities: analysis.entities,
        action: analysis.action
      }, {
        processingTime,
        model: 'gpt-4o',
        tokensUsed: analysis.tokensUsed
      });

      // Sauvegarder la réponse
      this.#repo.saveResponse(messageDbId, analysis.reply, 'auto');

      // Sauvegarder le message sortant
      if (sentMessage?.id?._serialized) {
        this.#repo.saveOutgoingMessage(
          sentMessage.id._serialized,
          contact.id,
          analysis.reply,
          Date.now()
        );
      }

      this.#logger.info('Message processed successfully', {
        messageDbId,
        from: rawMessage.from,
        action: analysis.action,
        urgency: analysis.urgency,
        category: analysis.category,
        confidence: analysis.confidence,
        processingTime: `${processingTime}ms`
      });

    } catch (error) {
      this.#logger.error('Failed to handle message', { 
        error: error.message,
        stack: error.stack,
        messageDbId,
        from: rawMessage.from
      });

      // Log l'erreur dans la DB si on a un messageDbId
      if (messageDbId) {
        this.#repo.logError(
          messageDbId,
          error.name || 'UnknownError',
          error.message,
          error.stack
        );
      }
      
      // Notify admin of errors via Telegram if available
      if (this.#telegram) {
        const errorDetails = messageDbId 
          ? `Message ID: ${messageDbId}\n` 
          : '';
        await this.#telegram.sendMessage(
          `❌ Error processing message:\n${errorDetails}From: ${rawMessage.from}\nError: ${error.message}`
        );
      }
    }
  }

  async #simulateTyping(chatId, messageLength) {
    try {
      await this.#whatsapp.sendStateTyping(chatId);
      
      // Calculate realistic typing time based on message length
      // Average human typing speed: 40 words/minute = ~200 characters/minute
      const baseDelay = (messageLength / 200) * 60 * 1000;
      
      // Add randomness (+/- 30%)
      const randomFactor = 0.7 + (Math.random() * 0.6);
      const typingDuration = Math.min(baseDelay * randomFactor, 5000); // Max 5 seconds
      
      // Minimum delay of 2 seconds
      const delay = Math.max(typingDuration, 2000);
      
      await this.#sleep(delay);
    } catch (error) {
      // Continue even if typing simulation fails
      this.#logger.warn('Failed to simulate typing', { error: error.message });
    }
  }

  async #handleActions(analysis, rawMessage, messageDbId) {
    if (analysis.action === 'calendar_event' && this.#calendar) {
      const actionId = this.#repo.createAction(messageDbId, 'calendar_event', { body: rawMessage.body });
      
      try {
        // Use structured event details if available, otherwise fallback to message body
        const eventData = analysis.event_details || rawMessage.body;
        const result = await this.#calendar.createEvent(eventData);

        this.#repo.updateActionStatus(actionId, 'completed', JSON.stringify(result));
        this.#logger.info('Calendar event created', { result });
      } catch (error) {
        this.#repo.updateActionStatus(actionId, 'failed', error.message);
        throw error;
      }
    }

    if (analysis.action === 'notify_admin' && this.#telegram) {
      const actionId = this.#repo.createAction(messageDbId, 'notify_admin', { from: rawMessage.from });
      
      await this.#telegram.sendMessage(
        `🚨 Urgent message from ${escapeHtml(rawMessage.from)}:\n\n${escapeHtml(rawMessage.body)}`
      );
      
      this.#repo.updateActionStatus(actionId, 'completed');
    }

    if (analysis.urgency === 'critical' && this.#telegram) {
      const actionId = this.#repo.createAction(messageDbId, 'critical_alert', { urgency: analysis.urgency });
      
      await this.#telegram.sendMessage(
        `⚠️ Critical urgency detected from ${escapeHtml(rawMessage.from)}:\n\n${escapeHtml(rawMessage.body)}`
      );
      
      this.#repo.updateActionStatus(actionId, 'completed');
    }
  }

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
