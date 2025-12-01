#!/usr/bin/env node
/**
 * Script de migration de la base de données C.A.R.L.
 * 
 * Usage:
 *   node scripts/migrate-db.js [--dry-run] [--optimize]
 * 
 * Options:
 *   --dry-run   Affiche les changements sans les appliquer
 *   --optimize  Exécute VACUUM et ANALYZE après la migration
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'carl.db');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldOptimize = args.includes('--optimize');

console.log('='.repeat(50));
console.log('C.A.R.L. Database Migration Tool');
console.log('='.repeat(50));
console.log(`Database: ${DB_PATH}`);
console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
console.log('');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================
// MIGRATION STEPS
// ============================================

const migrations = [
  {
    name: 'Add settings table',
    check: () => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
      return !exists;
    },
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          description TEXT,
          updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        )
      `);
    }
  },
  {
    name: 'Add missing indexes for messages',
    check: () => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_message_id'").get();
      return !exists;
    },
    up: () => {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id)`);
    }
  },
  {
    name: 'Add missing indexes for message_analysis',
    check: () => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_message_analysis_sentiment'").get();
      return !exists;
    },
    up: () => {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_message_analysis_sentiment ON message_analysis(sentiment)`);
    }
  },
  {
    name: 'Add missing indexes for contacts',
    check: () => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contacts_last_seen'").get();
      return !exists;
    },
    up: () => {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen_at)`);
    }
  },
  {
    name: 'Add missing indexes for conversations',
    check: () => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_conversations_status'").get();
      return !exists;
    },
    up: () => {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)`);
    }
  },
  {
    name: 'Add missing indexes for errors',
    check: () => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_errors_resolved'").get();
      return !exists;
    },
    up: () => {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_errors_resolved ON errors(resolved)`);
    }
  },
  {
    name: 'Add missing indexes for actions',
    check: () => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_actions_status'").get();
      return !exists;
    },
    up: () => {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status)`);
    }
  },
  {
    name: 'Add missing indexes for responses',
    check: () => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_responses_message_id'").get();
      return !exists;
    },
    up: () => {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_responses_message_id ON responses(message_id)`);
    }
  },
  {
    name: 'Remove legacy conversations_old table',
    check: () => {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations_old'").get();
      return !!exists;
    },
    up: () => {
      db.exec(`DROP TABLE IF EXISTS conversations_old`);
    }
  }
];

// ============================================
// RUN MIGRATIONS
// ============================================

let appliedCount = 0;
let skippedCount = 0;

console.log('Checking migrations...\n');

for (const migration of migrations) {
  const needsRun = migration.check();
  
  if (needsRun) {
    console.log(`[PENDING] ${migration.name}`);
    
    if (!isDryRun) {
      try {
        migration.up();
        console.log(`  ✅ Applied successfully`);
        appliedCount++;
      } catch (error) {
        console.error(`  ❌ Failed: ${error.message}`);
        process.exit(1);
      }
    } else {
      console.log(`  ⏭️  Would apply (dry-run)`);
      appliedCount++;
    }
  } else {
    console.log(`[SKIP] ${migration.name} - Already applied`);
    skippedCount++;
  }
}

console.log('');

// ============================================
// OPTIMIZATION
// ============================================

if (shouldOptimize && !isDryRun) {
  console.log('Running optimization...');
  db.exec('VACUUM');
  db.exec('ANALYZE');
  console.log('✅ Optimization complete\n');
}

// ============================================
// SUMMARY
// ============================================

const tables = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
const indexes = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").get();
const pageCount = db.pragma('page_count', { simple: true });
const pageSize = db.pragma('page_size', { simple: true });
const sizeMB = ((pageCount * pageSize) / (1024 * 1024)).toFixed(2);

console.log('='.repeat(50));
console.log('Migration Summary');
console.log('='.repeat(50));
console.log(`Applied: ${appliedCount}`);
console.log(`Skipped: ${skippedCount}`);
console.log(`Tables: ${tables.count}`);
console.log(`Indexes: ${indexes.count}`);
console.log(`Size: ${sizeMB} MB`);
console.log('');

db.close();

if (isDryRun) {
  console.log('⚠️  DRY RUN - No changes were made');
} else {
  console.log('✅ Migration complete!');
}
