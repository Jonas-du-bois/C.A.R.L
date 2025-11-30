import { Message } from '../domain/Message.js';

export class MessageRepository {
  #db;

  constructor(database) {
    this.#db = database;
  }

  save(message) {
    return this.#db.prepare(`
      INSERT INTO conversations (message_id, sender_id, body, timestamp)
      VALUES (?, ?, ?, ?)
    `).run(message.id, message.from, message.body, message.timestamp);
  }

  findRecent(chatId, limit = 10) {
    return this.#db.prepare(`
      SELECT message_id as id, sender_id as "from", body, timestamp
      FROM conversations
      WHERE sender_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(chatId, limit).map(row => new Message(row)).reverse();
  }
}
