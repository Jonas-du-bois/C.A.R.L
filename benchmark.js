import Database from './src/repositories/Database.js';
import MessageRepository from './src/repositories/MessageRepository.js';

async function run() {
  const db = new Database(':memory:');
  const repo = new MessageRepository(db);

  // Seed data
  for (let i = 0; i < 1000; i++) {
    repo.findOrCreateContact(`1234567${i}`, { pushName: `User ${i}` }, { incrementReceived: true });
    // we need to insert some messages
    db.getInstance().prepare(`
      INSERT INTO messages (id, message_id, contact_id, direction, body, timestamp, received_at)
      VALUES (?, ?, ?, 'incoming', 'hello', 123, 123)
    `).run(`msg_${i}`, `ext_${i}`, i + 1);
  }

  console.log("Data created.");

  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    repo.getTopContacts(10);
  }
  const end = performance.now();
  console.log(`Time: ${end - start}ms`);
}
run();
