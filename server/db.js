const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

// Render's free/persistent disk (if attached) is mounted at DATA_DIR; falls
// back to a local ./data folder for local development.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "erp.db"));
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS masters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    master_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    group_name TEXT,
    code TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_masters_master_name ON masters(master_name);
  CREATE INDEX IF NOT EXISTS idx_masters_account_type ON masters(account_type);
`);

module.exports = db;
