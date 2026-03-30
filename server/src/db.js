const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'illustconverter.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    username TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    credits INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    prompt TEXT NOT NULL,
    negative_prompt TEXT DEFAULT '',
    strength REAL DEFAULT 0.7,
    noise REAL DEFAULT 0.0,
    sampler TEXT DEFAULT 'k_euler',
    steps INTEGER DEFAULT 28,
    scale REAL DEFAULT 5.0,
    model TEXT DEFAULT 'nai-diffusion-3',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    result_image TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id)
  );

  CREATE TABLE IF NOT EXISTS credit_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    credits INTEGER NOT NULL,
    price_yen INTEGER NOT NULL,
    stripe_price_id TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER,
    credits_amount INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'purchase',
    stripe_session_id TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES credit_plans(id)
  );
`);

// Migration: add credits column if missing (for existing DBs)
try {
  db.prepare("SELECT credits FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0");
  console.log('✅ Migration: added credits column to users');
}

module.exports = db;
