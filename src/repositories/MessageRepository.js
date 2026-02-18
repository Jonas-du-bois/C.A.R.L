import { Message } from '../domain/Message.js';

export class MessageRepository {
  #db;

  constructor(database) {
    this.#db = database;
  }

  // ============================================
  // CONTACTS
  // ============================================

  /**
   * Trouve ou crée un contact par numéro de téléphone
   * @param {string} phoneNumber
   * @param {Object} metadata
   * @param {Object} options
   * @param {boolean} options.incrementReceived - Whether to atomically increment total_messages_received
   */
  findOrCreateContact(phoneNumber, metadata = {}, options = {}) {
    const now = Date.now();
    const increment = options.incrementReceived ? 1 : 0;
    
    // ⚡ Bolt: Optimized to single UPSERT query with RETURNING *
    // This reduces DB roundtrips and handles concurrency better
    // Added atomic increment of total_messages_received to avoid extra UPDATE query
    return this.#db.prepare(`
      INSERT INTO contacts (phone_number, push_name, display_name, is_group, first_seen_at, last_seen_at, updated_at, total_messages_received)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(phone_number) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        push_name = COALESCE(excluded.push_name, contacts.push_name),
        display_name = COALESCE(excluded.display_name, contacts.display_name),
        updated_at = excluded.updated_at,
        total_messages_received = contacts.total_messages_received + excluded.total_messages_received
      RETURNING *
    `).get(
      phoneNumber,
      metadata.pushName || null,
      metadata.displayName || null,
      metadata.isGroup ? 1 : 0,
      now,
      now,
      now,
      increment
    );
  }

  getContactById(contactId) {
    return this.#db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(contactId);
  }

  getContactByPhone(phoneNumber) {
    return this.#db.prepare(`SELECT * FROM contacts WHERE phone_number = ?`).get(phoneNumber);
  }

  updateContactStats(contactId, direction) {
    const column = direction === 'incoming' ? 'total_messages_received' : 'total_messages_sent';
    this.#db.prepare(`
      UPDATE contacts SET ${column} = ${column} + 1, updated_at = ? WHERE id = ?
    `).run(Date.now(), contactId);
  }

  blockContact(phoneNumber) {
    return this.#db.prepare(`
      UPDATE contacts SET is_blocked = 1, updated_at = ? WHERE phone_number = ?
    `).run(Date.now(), phoneNumber);
  }

  getAllContacts(limit = 100, offset = 0) {
    return this.#db.prepare(`
      SELECT * FROM contacts ORDER BY last_seen_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  // ============================================
  // MESSAGES
  // ============================================

  /**
   * Sauvegarde un message entrant AVANT le traitement IA
   */
  saveIncomingMessage(message, contactId, metadata = {}) {
    const result = this.#db.prepare(`
      INSERT INTO messages (message_id, contact_id, direction, body, media_type, media_url, is_forwarded, is_broadcast, quoted_message_id, received_at)
      VALUES (?, ?, 'incoming', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.id,
      contactId,
      message.body,
      metadata.mediaType || null,
      metadata.mediaUrl || null,
      metadata.isForwarded ? 1 : 0,
      metadata.isBroadcast ? 1 : 0,
      metadata.quotedMessageId || null,
      message.timestamp
    );

    // Update contact stats (only if not skipped)
    if (!metadata.skipStatsUpdate) {
      this.updateContactStats(contactId, 'incoming');
    }

    return result.lastInsertRowid;
  }

  /**
   * Sauvegarde un message sortant (réponse du bot)
   */
  saveOutgoingMessage(messageId, contactId, body, timestamp) {
    const result = this.#db.prepare(`
      INSERT INTO messages (message_id, contact_id, direction, body, received_at)
      VALUES (?, ?, 'outgoing', ?, ?)
    `).run(messageId, contactId, body, timestamp);

    // Update contact stats
    this.updateContactStats(contactId, 'outgoing');

    return result.lastInsertRowid;
  }

  getMessageById(messageId) {
    return this.#db.prepare(`
      SELECT m.*, c.phone_number, c.push_name, c.display_name
      FROM messages m
      JOIN contacts c ON m.contact_id = c.id
      WHERE m.message_id = ?
    `).get(messageId);
  }

  getMessageByInternalId(id) {
    return this.#db.prepare(`
      SELECT m.*, c.phone_number, c.push_name, c.display_name
      FROM messages m
      JOIN contacts c ON m.contact_id = c.id
      WHERE m.id = ?
    `).get(id);
  }

  /**
   * Récupère les derniers messages pour diagnostic (debug)
   * @param {number} limit - Nombre de messages à récupérer
   * @returns {Array} Messages avec infos complètes
   */
  getRecentMessagesDebug(limit = 10) {
    const rows = this.#db.prepare(`
      SELECT m.*, c.phone_number, c.push_name, c.display_name
      FROM messages m
      JOIN contacts c ON m.contact_id = c.id
      ORDER BY m.received_at DESC
      LIMIT ?
    `).all(limit);

    // Filtrer les doublons par message_id (au cas où la BD contient des entrées dupliquées)
    const seen = new Set();
    const deduped = [];
    for (const r of rows) {
      if (!r.message_id) {
        // Si pas de message_id, utiliser l'id interne
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        deduped.push(r);
        continue;
      }
      if (seen.has(r.message_id)) continue;
      seen.add(r.message_id);
      deduped.push(r);
    }

    return deduped;
  }

  /**
   * Récupère les messages récents pour le contexte IA
   */
  findRecent(phoneNumber, limit = 10) {
    const rows = this.#db.prepare(`
      SELECT m.message_id as id, c.phone_number as "from", m.body, m.received_at as timestamp,
             ma.urgency, ma.category
      FROM messages m
      JOIN contacts c ON m.contact_id = c.id
      LEFT JOIN message_analysis ma ON m.id = ma.message_id
      WHERE c.phone_number = ?
      ORDER BY m.received_at DESC
      LIMIT ?
    `).all(phoneNumber, limit);

    return rows.map(row => new Message({
      id: row.id,
      from: row.from,
      body: row.body,
      timestamp: row.timestamp,
      urgency: row.urgency || 'low',
      category: row.category || 'other'
    })).reverse();
  }

  /**
   * Récupère les messages récents par ID de contact (Optimisé pour éviter JOIN inutile)
   * Utilise l'index idx_messages_contact_received(contact_id, received_at DESC)
   */
  findRecentByContactId(contactId, phoneNumber, limit = 10) {
    const rows = this.#db.prepare(`
      SELECT m.message_id as id, m.body, m.received_at as timestamp,
             ma.urgency, ma.category
      FROM messages m
      LEFT JOIN message_analysis ma ON m.id = ma.message_id
      WHERE m.contact_id = ?
      ORDER BY m.received_at DESC
      LIMIT ?
    `).all(contactId, limit);

    return rows.map(row => new Message({
      id: row.id,
      from: phoneNumber, // On passe le numéro directement puisqu'on le connaît déjà
      body: row.body,
      timestamp: row.timestamp,
      urgency: row.urgency || 'low',
      category: row.category || 'other'
    })).reverse();
  }

  getMessagesByContact(contactId, limit = 50, offset = 0) {
    return this.#db.prepare(`
      SELECT m.*, ma.intent, ma.urgency, ma.category, ma.sentiment, ma.confidence
      FROM messages m
      LEFT JOIN message_analysis ma ON m.id = ma.message_id
      WHERE m.contact_id = ?
      ORDER BY m.received_at DESC
      LIMIT ? OFFSET ?
    `).all(contactId, limit, offset);
  }

  getMessagesByDateRange(startDate, endDate) {
    return this.#db.prepare(`
      SELECT m.*, c.phone_number, ma.urgency, ma.category, ma.sentiment
      FROM messages m
      JOIN contacts c ON m.contact_id = c.id
      LEFT JOIN message_analysis ma ON m.id = ma.message_id
      WHERE m.received_at BETWEEN ? AND ?
      ORDER BY m.received_at ASC
    `).all(startDate, endDate);
  }

  // ============================================
  // MESSAGE ANALYSIS
  // ============================================

  /**
   * Sauvegarde les résultats de l'analyse IA
   */
  saveAnalysis(messageDbId, analysis, metadata = {}) {
    return this.#db.prepare(`
      INSERT INTO message_analysis 
        (message_id, intent, urgency, category, sentiment, confidence, keywords, entities, action_required, processing_time_ms, model_used, tokens_used, analyzed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      messageDbId,
      analysis.intent || null,
      analysis.urgency || 'low',
      analysis.category || 'other',
      analysis.sentiment || 'neutral',
      analysis.confidence || null,
      analysis.keywords ? JSON.stringify(analysis.keywords) : null,
      analysis.entities ? JSON.stringify(analysis.entities) : null,
      analysis.action || null,
      metadata.processingTime || null,
      metadata.model || 'gpt-4o',
      metadata.tokensUsed || null,
      Date.now()
    );
  }

  getAnalysisByMessageId(messageDbId) {
    return this.#db.prepare(`
      SELECT * FROM message_analysis WHERE message_id = ?
    `).get(messageDbId);
  }

  // ============================================
  // RESPONSES
  // ============================================

  /**
   * Sauvegarde une réponse envoyée
   */
  saveResponse(messageDbId, responseText, responseType = 'auto') {
    return this.#db.prepare(`
      INSERT INTO responses (message_id, response_text, response_type, sent_at)
      VALUES (?, ?, ?, ?)
    `).run(messageDbId, responseText, responseType, Date.now());
  }

  updateResponseStatus(responseId, status) {
    return this.#db.prepare(`
      UPDATE responses SET delivery_status = ? WHERE id = ?
    `).run(status, responseId);
  }

  // ============================================
  // ERRORS
  // ============================================

  /**
   * Log une erreur de traitement
   */
  logError(messageDbId, errorType, errorMessage, errorStack = null) {
    return this.#db.prepare(`
      INSERT INTO errors (message_id, error_type, error_message, error_stack, occurred_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(messageDbId, errorType, errorMessage, errorStack, Date.now());
  }

  getRecentErrors(limit = 50) {
    return this.#db.prepare(`
      SELECT e.*, m.body as message_body, c.phone_number
      FROM errors e
      LEFT JOIN messages m ON e.message_id = m.id
      LEFT JOIN contacts c ON m.contact_id = c.id
      ORDER BY e.occurred_at DESC
      LIMIT ?
    `).all(limit);
  }

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Crée une action à exécuter
   */
  createAction(messageDbId, actionType, actionData = null) {
    return this.#db.prepare(`
      INSERT INTO actions (message_id, action_type, action_data)
      VALUES (?, ?, ?)
    `).run(messageDbId, actionType, actionData ? JSON.stringify(actionData) : null);
  }

  updateActionStatus(actionId, status, result = null) {
    return this.#db.prepare(`
      UPDATE actions SET status = ?, executed_at = ?, result = ? WHERE id = ?
    `).run(status, Date.now(), result, actionId);
  }

  getPendingActions() {
    return this.#db.prepare(`
      SELECT a.*, m.body as message_body
      FROM actions a
      JOIN messages m ON a.message_id = m.id
      WHERE a.status = 'pending'
      ORDER BY a.created_at ASC
    `).all();
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Génère les statistiques journalières
   */
  generateDailyStats(dateStr) {
    const startOfDay = new Date(dateStr).setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr).setHours(23, 59, 59, 999);

    const stats = this.#db.prepare(`
      SELECT
        COUNT(CASE WHEN m.direction = 'incoming' THEN 1 END) as total_received,
        COUNT(CASE WHEN m.direction = 'outgoing' THEN 1 END) as total_sent,
        COUNT(DISTINCT m.contact_id) as unique_contacts
      FROM messages m
      WHERE m.received_at BETWEEN ? AND ?
    `).get(startOfDay, endOfDay);

    const byUrgency = this.#db.prepare(`
      SELECT ma.urgency, COUNT(*) as count
      FROM messages m
      JOIN message_analysis ma ON m.id = ma.message_id
      WHERE m.received_at BETWEEN ? AND ?
      GROUP BY ma.urgency
    `).all(startOfDay, endOfDay);

    const byCategory = this.#db.prepare(`
      SELECT ma.category, COUNT(*) as count
      FROM messages m
      JOIN message_analysis ma ON m.id = ma.message_id
      WHERE m.received_at BETWEEN ? AND ?
      GROUP BY ma.category
    `).all(startOfDay, endOfDay);

    const bySentiment = this.#db.prepare(`
      SELECT ma.sentiment, COUNT(*) as count
      FROM messages m
      JOIN message_analysis ma ON m.id = ma.message_id
      WHERE m.received_at BETWEEN ? AND ?
      GROUP BY ma.sentiment
    `).all(startOfDay, endOfDay);

    const errors = this.#db.prepare(`
      SELECT COUNT(*) as count FROM errors WHERE occurred_at BETWEEN ? AND ?
    `).get(startOfDay, endOfDay);

    const tokens = this.#db.prepare(`
      SELECT SUM(tokens_used) as total FROM message_analysis WHERE analyzed_at BETWEEN ? AND ?
    `).get(startOfDay, endOfDay);

    return {
      date: dateStr,
      total_received: stats?.total_received || 0,
      total_sent: stats?.total_sent || 0,
      unique_contacts: stats?.unique_contacts || 0,
      by_urgency: Object.fromEntries(byUrgency.map(r => [r.urgency, r.count])),
      by_category: Object.fromEntries(byCategory.map(r => [r.category, r.count])),
      by_sentiment: Object.fromEntries(bySentiment.map(r => [r.sentiment, r.count])),
      errors_count: errors?.count || 0,
      tokens_used: tokens?.total || 0
    };
  }

  /**
   * Sauvegarde les stats journalières
   */
  saveDailyStats(stats) {
    return this.#db.prepare(`
      INSERT OR REPLACE INTO daily_stats 
        (date, total_messages_received, total_messages_sent, unique_contacts, 
         messages_by_urgency, messages_by_category, messages_by_sentiment, 
         errors_count, tokens_used, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stats.date,
      stats.total_received,
      stats.total_sent,
      stats.unique_contacts,
      JSON.stringify(stats.by_urgency),
      JSON.stringify(stats.by_category),
      JSON.stringify(stats.by_sentiment),
      stats.errors_count,
      stats.tokens_used,
      Date.now()
    );
  }

  getDailyStats(dateStr) {
    return this.#db.prepare(`SELECT * FROM daily_stats WHERE date = ?`).get(dateStr);
  }

  /**
   * Retourne le timestamp de minuit (début de la journée en cours)
   */
  #getMidnightTimestamp() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return midnight.getTime();
  }

  /**
   * Récupère tous les messages de la journée en cours pour le rapport
   * Optimisé pour envoyer une seule requête à l'IA
   */
  getMessagesForReport() {
    const since = this.#getMidnightTimestamp();
    
    return this.#db.prepare(`
      SELECT 
        m.id,
        m.body,
        m.direction,
        m.received_at,
        c.phone_number,
        c.push_name,
        c.display_name,
        ma.intent,
        ma.urgency,
        ma.category,
        ma.sentiment,
        r.response_text
      FROM messages m
      JOIN contacts c ON m.contact_id = c.id
      LEFT JOIN message_analysis ma ON m.id = ma.message_id
      LEFT JOIN responses r ON m.id = r.message_id
      WHERE m.received_at >= ? AND m.direction = 'incoming'
      ORDER BY m.received_at ASC
    `).all(since);
  }

  /**
   * Récupère les conversations groupées par contact pour le rapport IA
   * Inclut les messages entrants ET sortants pour donner le contexte complet
   * @param {number} maxMessagesPerContact - Limite de messages par contact (défaut: 20)
   * @returns {Object} Conversations groupées par contact avec métadonnées
   */
  getConversationsForReport(maxMessagesPerContact = 20, limitContacts = null) {
    const since = this.#getMidnightTimestamp();
    let allMessages;
    
    if (limitContacts) {
      // ⚡ Bolt: Two-step optimization to avoid fetching bodies for inactive contacts
      // 1. Identify top N most active contacts (by message count)
      const topContacts = this.#db.prepare(`
        SELECT contact_id, COUNT(*) as count
        FROM messages
        WHERE received_at >= ?
        GROUP BY contact_id
        ORDER BY count DESC
        LIMIT ?
      `).all(since, limitContacts);

      if (topContacts.length === 0) {
        return [];
      }

      const contactIds = topContacts.map(r => r.contact_id);
      const placeholders = contactIds.map(() => '?').join(',');

      // 2. Fetch full message details ONLY for these top N contacts
      allMessages = this.#db.prepare(`
        SELECT
          m.id,
          m.body,
          m.direction,
          m.received_at,
          m.contact_id,
          c.phone_number,
          c.push_name,
          c.display_name,
          ma.intent,
          ma.urgency,
          ma.category,
          ma.sentiment
        FROM messages m
        JOIN contacts c ON m.contact_id = c.id
        LEFT JOIN message_analysis ma ON m.id = ma.message_id
        WHERE m.contact_id IN (${placeholders}) AND m.received_at >= ?
        ORDER BY m.received_at ASC
      `).all(...contactIds, since);
    } else {
      // Original behavior: Fetch all active conversations
      allMessages = this.#db.prepare(`
        SELECT
          m.id,
          m.body,
          m.direction,
          m.received_at,
          m.contact_id,
          c.phone_number,
          c.push_name,
          c.display_name,
          ma.intent,
          ma.urgency,
          ma.category,
          ma.sentiment
        FROM messages m
        JOIN contacts c ON m.contact_id = c.id
        LEFT JOIN message_analysis ma ON m.id = ma.message_id
        WHERE m.received_at >= ?
        ORDER BY m.received_at ASC
      `).all(since);
    }

    // Grouper par contact
    const conversations = {};
    
    for (const msg of allMessages) {
      const contactKey = msg.phone_number;
      const contactName = msg.push_name || msg.display_name || msg.phone_number.split('@')[0];
      
      if (!conversations[contactKey]) {
        conversations[contactKey] = {
          contactName,
          phoneNumber: msg.phone_number,
          messages: [],
          stats: {
            incoming: 0,
            outgoing: 0,
            categories: {},
            urgencies: {}
          }
        };
      }
      
      const conv = conversations[contactKey];
      
      // Limiter le nombre de messages par contact
      if (conv.messages.length < maxMessagesPerContact) {
        conv.messages.push({
          direction: msg.direction,
          body: msg.body,
          timestamp: msg.received_at,
          category: msg.category,
          urgency: msg.urgency,
          sentiment: msg.sentiment
        });
      }
      
      // Mettre à jour les stats
      if (msg.direction === 'incoming') {
        conv.stats.incoming++;
        if (msg.category) {
          conv.stats.categories[msg.category] = (conv.stats.categories[msg.category] || 0) + 1;
        }
        if (msg.urgency) {
          conv.stats.urgencies[msg.urgency] = (conv.stats.urgencies[msg.urgency] || 0) + 1;
        }
      } else {
        conv.stats.outgoing++;
      }
    }

    // Convertir en tableau et trier par nombre de messages (plus actifs en premier)
    return Object.values(conversations)
      .sort((a, b) => b.messages.length - a.messages.length);
  }

  /**
   * Statistiques rapides sans IA (journée en cours)
   */
  getQuickStats() {
    const since = this.#getMidnightTimestamp();
    
    const totals = this.#db.prepare(`
      SELECT 
        COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as received,
        COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as sent,
        COUNT(DISTINCT contact_id) as contacts
      FROM messages WHERE received_at >= ?
    `).get(since);

    const byCategory = this.#db.prepare(`
      SELECT ma.category, COUNT(*) as count
      FROM messages m
      JOIN message_analysis ma ON m.id = ma.message_id
      WHERE m.received_at >= ?
      GROUP BY ma.category
    `).all(since);

    const byUrgency = this.#db.prepare(`
      SELECT ma.urgency, COUNT(*) as count
      FROM messages m
      JOIN message_analysis ma ON m.id = ma.message_id
      WHERE m.received_at >= ?
      GROUP BY ma.urgency
    `).all(since);

    const errors = this.#db.prepare(`
      SELECT COUNT(*) as count FROM errors WHERE occurred_at >= ?
    `).get(since);

    return {
      received: totals?.received || 0,
      sent: totals?.sent || 0,
      contacts: totals?.contacts || 0,
      byCategory: Object.fromEntries(byCategory.map(r => [r.category, r.count])),
      byUrgency: Object.fromEntries(byUrgency.map(r => [r.urgency, r.count])),
      errors: errors?.count || 0
    };
  }

  getStatsRange(startDate, endDate) {
    return this.#db.prepare(`
      SELECT * FROM daily_stats WHERE date BETWEEN ? AND ? ORDER BY date ASC
    `).all(startDate, endDate);
  }

  /**
   * Statistiques globales
   */
  getGlobalStats() {
    return this.#db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM contacts) as total_contacts,
        (SELECT COUNT(*) FROM messages WHERE direction = 'incoming') as total_messages_received,
        (SELECT COUNT(*) FROM messages WHERE direction = 'outgoing') as total_messages_sent,
        (SELECT COUNT(*) FROM message_analysis) as total_analyzed,
        (SELECT COUNT(*) FROM errors) as total_errors,
        (SELECT SUM(tokens_used) FROM message_analysis) as total_tokens_used
    `).get();
  }

  /**
   * Top contacts par nombre de messages
   */
  getTopContacts(limit = 10) {
    return this.#db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id AND m.direction = 'incoming') as messages_received,
        (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id AND m.direction = 'outgoing') as messages_sent
      FROM contacts c
      ORDER BY (c.total_messages_received + c.total_messages_sent) DESC
      LIMIT ?
    `).all(limit);
  }

  // ============================================
  // LEGACY SUPPORT (pour compatibilité avec l'ancien code)
  // ============================================

  /**
   * @deprecated Utilisez saveIncomingMessage + saveAnalysis
   */
  save(message) {
    const contact = this.findOrCreateContact(message.from);
    const messageDbId = this.saveIncomingMessage(message, contact.id);
    
    if (message.urgency || message.category) {
      this.saveAnalysis(messageDbId, {
        urgency: message.urgency,
        category: message.category
      });
    }
    
    return messageDbId;
  }
}
