const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

// Used for Render and local dev. NOT used on Vercel: Vercel's filesystem is
// ephemeral, so a file-based database there would lose data on every
// redeploy/cold start - see server/store/postgres.js for that path instead.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
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

function rowToRecord(row) {
  return { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, ...JSON.parse(row.data) };
}

function rowToSummary(row) {
  return {
    id: row.id,
    masterName: row.master_name,
    accountType: row.account_type,
    groupName: row.group_name,
    code: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listMasters({ q, accountType, page, pageSize }) {
  const where = [];
  const params = {};
  if (q) {
    where.push("(master_name LIKE @q OR code LIKE @q OR group_name LIKE @q)");
    params.q = `%${q}%`;
  }
  if (accountType) {
    where.push("account_type = @accountType");
    params.accountType = accountType;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = db.prepare(`SELECT COUNT(*) AS n FROM masters ${whereSql}`).get(params).n;
  const rows = db
    .prepare(`SELECT * FROM masters ${whereSql} ORDER BY updated_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  return { items: rows.map(rowToSummary), total };
}

async function getMasterById(id) {
  const row = db.prepare("SELECT * FROM masters WHERE id = ?").get(id);
  return row ? rowToRecord(row) : null;
}

async function createMaster(fields) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO masters (master_name, account_type, group_name, code, data, created_at, updated_at)
       VALUES (@master_name, @account_type, @group_name, @code, @data, @now, @now)`
    )
    .run({
      master_name: fields.MasterName,
      account_type: fields.AccountType,
      group_name: fields.GroupName || null,
      code: fields.Code || null,
      data: JSON.stringify(fields),
      now,
    });
  return getMasterById(info.lastInsertRowid);
}

async function updateMaster(id, fields) {
  const existing = db.prepare("SELECT id FROM masters WHERE id = ?").get(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE masters SET master_name=@master_name, account_type=@account_type, group_name=@group_name,
       code=@code, data=@data, updated_at=@now WHERE id=@id`
  ).run({
    id,
    master_name: fields.MasterName,
    account_type: fields.AccountType,
    group_name: fields.GroupName || null,
    code: fields.Code || null,
    data: JSON.stringify(fields),
    now,
  });
  return getMasterById(id);
}

async function deleteMaster(id) {
  const info = db.prepare("DELETE FROM masters WHERE id = ?").run(id);
  return info.changes > 0;
}

async function listAllFull() {
  const rows = db.prepare("SELECT * FROM masters ORDER BY id").all();
  return rows.map(rowToRecord);
}

module.exports = { listMasters, getMasterById, createMaster, updateMaster, deleteMaster, listAllFull };
