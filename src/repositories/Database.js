import Database from 'better-sqlite3';

export class SQLiteDatabase {
  #db;

  constructor(config) {
    this.#db = new Database(config.database.path);
    this.init();
  }

  init() {
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('foreign_keys = ON');

    // FIRST: Migrate old schema if needed (before creating new tables)
    this.#migrateOldSchema();

    // ============================================
    // TABLE: contacts - Informations sur les contacts
    // ============================================
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT UNIQUE NOT NULL,
        display_name TEXT,
        push_name TEXT,
        is_group INTEGER DEFAULT 0,
        is_blocked INTEGER DEFAULT 0,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        total_messages_received INTEGER DEFAULT 0,
        total_messages_sent INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // ============================================
    // TABLE: messages - Tous les messages reçus (AVANT traitement IA)
    // ============================================
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE NOT NULL,
        contact_id INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
        body TEXT NOT NULL,
        media_type TEXT,
        media_url TEXT,
        is_forwarded INTEGER DEFAULT 0,
        is_broadcast INTEGER DEFAULT 0,
        quoted_message_id TEXT,
        received_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (contact_id) REFERENCES contacts(id)
      )
    `);

    // ============================================
    // TABLE: message_analysis - Résultats de l'analyse IA
    // ============================================
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS message_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER UNIQUE NOT NULL,
        intent TEXT,
        urgency TEXT CHECK(urgency IN ('low', 'medium', 'high', 'critical')),
        category TEXT,
        sentiment TEXT CHECK(sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
        confidence REAL,
        keywords TEXT,
        entities TEXT,
        action_required TEXT,
        processing_time_ms INTEGER,
        model_used TEXT,
        tokens_used INTEGER,
        analyzed_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (message_id) REFERENCES messages(id)
      )
    `);

    // ============================================
    // TABLE: responses - Réponses envoyées par le bot
    // ============================================
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        response_text TEXT NOT NULL,
        response_type TEXT DEFAULT 'auto',
        sent_at INTEGER NOT NULL,
        delivery_status TEXT DEFAULT 'sent',
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (message_id) REFERENCES messages(id)
      )
    `);

    // ============================================
    // TABLE: conversations - Sessions de conversation
    // ============================================
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'idle', 'closed')),
        topic TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (contact_id) REFERENCES contacts(id)
      )
    `);

    // ============================================
    // TABLE: errors - Log des erreurs de traitement
    // ============================================
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        error_stack TEXT,
        occurred_at INTEGER NOT NULL,
        resolved INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (message_id) REFERENCES messages(id)
      )
    `);

    // ============================================
    // TABLE: daily_stats - Statistiques journalières agrégées
    // ============================================
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        total_messages_received INTEGER DEFAULT 0,
        total_messages_sent INTEGER DEFAULT 0,
        unique_contacts INTEGER DEFAULT 0,
        avg_response_time_ms INTEGER,
        messages_by_urgency TEXT,
        messages_by_category TEXT,
        messages_by_sentiment TEXT,
        errors_count INTEGER DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // ============================================
    // TABLE: actions - Actions effectuées (calendar, notifications, etc.)
    // ============================================
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        action_data TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
        executed_at INTEGER,
        result TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (message_id) REFERENCES messages(id)
      )
    `);

    // ============================================
    // TABLE: settings - Configuration persistante
    // ============================================
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // ============================================
    // INDEXES pour optimiser les requêtes
    // ============================================
    this.#db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);
      CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at);
      CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
      CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
      CREATE INDEX IF NOT EXISTS idx_message_analysis_urgency ON message_analysis(urgency);
      CREATE INDEX IF NOT EXISTS idx_message_analysis_category ON message_analysis(category);
      CREATE INDEX IF NOT EXISTS idx_message_analysis_sentiment ON message_analysis(sentiment);
      CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
      CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen_at);
      CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
      CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
      CREATE INDEX IF NOT EXISTS idx_errors_occurred_at ON errors(occurred_at);
      CREATE INDEX IF NOT EXISTS idx_errors_resolved ON errors(resolved);
      CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
      CREATE INDEX IF NOT EXISTS idx_responses_message_id ON responses(message_id);
    `);

    // Nettoyage des anciennes tables de migration
    this.#cleanupLegacyTables();
  }

  #cleanupLegacyTables() {
    try {
      // Supprimer les anciennes tables de migration si elles existent
      const legacyTables = ['conversations_old'];
      legacyTables.forEach(table => {
        const exists = this.#db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(table);
        
        if (exists) {
          this.#db.exec(`DROP TABLE IF EXISTS ${table}`);
          console.log(`[Database] Cleaned up legacy table: ${table}`);
        }
      });
    } catch (e) {
      console.log('[Database] Legacy cleanup:', e.message);
    }
  }

  #migrateOldSchema() {
    try {
      // Check if old conversations table exists with old schema (has sender_id column)
      const tables = this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'").all();
      
      if (tables.length > 0) {
        const tableInfo = this.#db.prepare("PRAGMA table_info(conversations)").all();
        const hasSenderId = tableInfo.some(col => col.name === 'sender_id');
        
        if (hasSenderId) {
          console.log('[Database] Detected old schema, migrating...');
          
          // Drop old table and related objects
          this.#db.exec("DROP TABLE IF EXISTS conversations_old");
          this.#db.exec("ALTER TABLE conversations RENAME TO conversations_old");
          
          console.log('[Database] Old conversations table renamed to conversations_old');
        }
      }
    } catch (e) {
      console.log('[Database] Migration check:', e.message);
    }
  }

  prepare(sql) {
    return this.#db.prepare(sql);
  }

  exec(sql) {
    return this.#db.exec(sql);
  }

  transaction(fn) {
    return this.#db.transaction(fn);
  }

  // ============================================
  // SETTINGS HELPERS
  // ============================================

  getSetting(key) {
    const row = this.#db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setSetting(key, value, description = null) {
    return this.#db.prepare(`
      INSERT INTO settings (key, value, description, updated_at) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
    `).run(key, value, description, Date.now(), value, Date.now());
  }

  getAllSettings() {
    return this.#db.prepare('SELECT * FROM settings').all();
  }

  // ============================================
  // MAINTENANCE HELPERS
  // ============================================

  /**
   * Optimise la base de données (VACUUM + ANALYZE)
   */
  optimize() {
    console.log('[Database] Running optimization...');
    this.#db.exec('VACUUM');
    this.#db.exec('ANALYZE');
    console.log('[Database] Optimization complete');
  }

  /**
   * Retourne des statistiques sur la base
   */
  getStats() {
    const tables = ['contacts', 'messages', 'message_analysis', 'responses', 'errors', 'actions', 'conversations', 'daily_stats'];
    const stats = {};
    
    tables.forEach(table => {
      try {
        const count = this.#db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        stats[table] = count.count;
      } catch (e) {
        stats[table] = 0;
      }
    });

    // Taille approximative de la base
    const pageCount = this.#db.pragma('page_count', { simple: true });
    const pageSize = this.#db.pragma('page_size', { simple: true });
    stats.size_bytes = pageCount * pageSize;
    stats.size_mb = (stats.size_bytes / (1024 * 1024)).toFixed(2);

    return stats;
  }

  /**
   * Nettoie les anciennes données (plus de X jours)
   */
  cleanOldData(daysToKeep = 90) {
    const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    const deleteErrors = this.#db.prepare(`
      DELETE FROM errors WHERE occurred_at < ? AND resolved = 1
    `).run(cutoff);

    console.log(`[Database] Cleaned ${deleteErrors.changes} old resolved errors`);
    
    return {
      errors_deleted: deleteErrors.changes
    };
  }

  close() {
    if (this.#db) {
      this.#db.close();
    }
  }
}
