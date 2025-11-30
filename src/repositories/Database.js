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
        timestamp INTEGER NOT NULL
      )
    `);
  }

  prepare(sql) {
    return this.#db.prepare(sql);
  }
}
