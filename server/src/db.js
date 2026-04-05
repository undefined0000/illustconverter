const Database = require('better-sqlite3');
const path = require('path');
const {
  FIXED_NOVELAI_MODEL,
  DEFAULT_SAMPLER,
  DEFAULT_STEPS,
  DEFAULT_SCALE,
  DEFAULT_UC_PRESET,
} = require('./novelai-config');

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
    sampler TEXT DEFAULT '${DEFAULT_SAMPLER}',
    steps INTEGER DEFAULT ${DEFAULT_STEPS},
    scale REAL DEFAULT ${DEFAULT_SCALE},
    model TEXT DEFAULT '${FIXED_NOVELAI_MODEL}',
    quality_tags_enabled INTEGER DEFAULT 1,
    uc_preset TEXT DEFAULT '${DEFAULT_UC_PRESET}',
    character_prompts_json TEXT DEFAULT '[]',
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

  CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stripe_session_id
  ON transactions(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL AND stripe_session_id != '';
`);

// Migration: add credits column if missing (for existing DBs)
try {
  db.prepare("SELECT credits FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0");
  console.log('✅ Migration: added credits column to users');
}

function columnExists(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function addColumnIfMissing(tableName, columnDefinition) {
  const [columnName] = columnDefinition.split(' ');
  if (columnExists(tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  console.log(`✅ Migration: added ${columnName} column to ${tableName}`);
}

addColumnIfMissing('prompts', "quality_tags_enabled INTEGER DEFAULT 1");
addColumnIfMissing('prompts', `uc_preset TEXT DEFAULT '${DEFAULT_UC_PRESET}'`);
addColumnIfMissing('prompts', "character_prompts_json TEXT DEFAULT '[]'");

db.prepare('UPDATE prompts SET model = ? WHERE model IS NULL OR model != ?')
  .run(FIXED_NOVELAI_MODEL, FIXED_NOVELAI_MODEL);

db.prepare('UPDATE prompts SET quality_tags_enabled = 1 WHERE quality_tags_enabled IS NULL').run();
db.prepare('UPDATE prompts SET uc_preset = ? WHERE uc_preset IS NULL OR uc_preset = ?')
  .run(DEFAULT_UC_PRESET, '');
db.prepare('UPDATE prompts SET character_prompts_json = ? WHERE character_prompts_json IS NULL OR trim(character_prompts_json) = ?')
  .run('[]', '');

module.exports = db;
