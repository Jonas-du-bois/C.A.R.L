import Database from 'better-sqlite3';

const dbPath = 'test_bench.db';
import { unlinkSync } from 'fs';
try { unlinkSync(dbPath); unlinkSync(dbPath + '-wal'); unlinkSync(dbPath + '-shm'); } catch(e){}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    total_messages_received INTEGER DEFAULT 0,
    total_messages_sent INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
    received_at INTEGER NOT NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );
`);

// Populate data
for (let i = 0; i < 100; i++) {
  db.prepare(`INSERT INTO contacts (phone_number, first_seen_at, last_seen_at, total_messages_received, total_messages_sent) VALUES (?, ?, ?, ?, ?)`).run(`test${i}@c.us`, Date.now(), Date.now(), Math.floor(Math.random() * 50), Math.floor(Math.random() * 50));
}

db.exec(`
  INSERT INTO messages (contact_id, direction, received_at)
  SELECT
    (abs(random()) % 100) + 1,
    CASE WHEN abs(random()) % 2 = 0 THEN 'incoming' ELSE 'outgoing' END,
    strftime('%s', 'now') * 1000
  FROM (SELECT * FROM (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) a, (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) b, (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) c, (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) d)
  LIMIT 500
`);


// Benchmark N+1 queries
const startLegacy = performance.now();
for(let i=0; i<1000; i++) {
  db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id AND m.direction = 'incoming') as messages_received,
      (SELECT COUNT(*) FROM messages m WHERE m.contact_id = c.id AND m.direction = 'outgoing') as messages_sent
    FROM contacts c
    ORDER BY (c.total_messages_received + c.total_messages_sent) DESC
    LIMIT 10
  `).all();
}
const endLegacy = performance.now();

// Benchmark using cached counters
const startOptimized = performance.now();
for(let i=0; i<1000; i++) {
  db.prepare(`
    SELECT c.*,
      c.total_messages_received as messages_received,
      c.total_messages_sent as messages_sent
    FROM contacts c
    ORDER BY (c.total_messages_received + c.total_messages_sent) DESC
    LIMIT 10
  `).all();
}
const endOptimized = performance.now();

console.log(`Legacy: ${endLegacy - startLegacy}ms`);
console.log(`Optimized: ${endOptimized - startOptimized}ms`);

try { unlinkSync(dbPath); unlinkSync(dbPath + '-wal'); unlinkSync(dbPath + '-shm'); } catch(e){}
