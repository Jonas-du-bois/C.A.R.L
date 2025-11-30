import { Message } from '../domain/Message.js';

export class MessageRepository {
  #db;

  constructor(database) {
    this.#db = database;
  }

  save(message) {
    return this.#db.prepare(`
      INSERT INTO conversations (message_id, sender_id, body, timestamp, urgency, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      message.id,
      message.from,
      message.body,
      message.timestamp,
      message.urgency || 'low',
      message.category || 'other'
    );
  }

  findRecent(chatId, limit = 10) {
    return this.#db.prepare(`
      SELECT message_id as id, sender_id as "from", body, timestamp, urgency, category
      FROM conversations
      WHERE sender_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(chatId, limit).map(row => new Message(row)).reverse();
  }

  generateDailyStats(dateStr) {
    // dateStr format: YYYY-MM-DD
    // SQLite stores timestamp as integer (unix epoch), need to convert
    return this.#db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN urgency = 'high' OR urgency = 'critical' THEN 1 ELSE 0 END) as urgent,
        SUM(CASE WHEN category = 'professional' THEN 1 ELSE 0 END) as professional,
        SUM(CASE WHEN category = 'personal' THEN 1 ELSE 0 END) as personal,
        SUM(CASE WHEN category = 'spam' THEN 1 ELSE 0 END) as spam
      FROM conversations
      WHERE date(timestamp / 1000, 'unixepoch') = ?
    `).get(dateStr);
  }
}
