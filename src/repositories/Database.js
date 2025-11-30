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

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        message_id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        body TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        urgency TEXT DEFAULT 'low',
        category TEXT DEFAULT 'other'
      )
    `);

    // Migration for existing tables (if any)
    try {
      this.#db.exec("ALTER TABLE conversations ADD COLUMN urgency TEXT DEFAULT 'low'");
      this.#db.exec("ALTER TABLE conversations ADD COLUMN category TEXT DEFAULT 'other'");
    } catch (e) {
      // Ignore error if columns already exist
    }
  }

  prepare(sql) {
    return this.#db.prepare(sql);
  }
}
