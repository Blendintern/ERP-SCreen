// Used on Vercel (and anywhere else DATABASE_URL/POSTGRES_URL is set), since
// Vercel's filesystem is ephemeral and can't hold the SQLite file used on
// Render - see server/store/sqlite.js for that path instead.
//
// Exported as a factory so it can be pointed at a different Pool
// implementation in tests (e.g. an in-memory Postgres-compatible engine)
// without needing a real database.
const { Pool } = require("pg");

function createPostgresStore(connectionString, { PoolClass = Pool, ssl = { rejectUnauthorized: false } } = {}) {
  const pool = new PoolClass({ connectionString, ssl });

  let ready = null;
  function ensureInit() {
    if (!ready) {
      ready = pool.query(`
        CREATE TABLE IF NOT EXISTS masters (
          id SERIAL PRIMARY KEY,
          master_name TEXT NOT NULL,
          account_type TEXT NOT NULL,
          group_name TEXT,
          code TEXT,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_masters_master_name ON masters(master_name);
        CREATE INDEX IF NOT EXISTS idx_masters_account_type ON masters(account_type);
      `);
    }
    return ready;
  }

  function rowToRecord(row) {
    return {
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      ...row.data,
    };
  }

  function rowToSummary(row) {
    return {
      id: row.id,
      masterName: row.master_name,
      accountType: row.account_type,
      groupName: row.group_name,
      code: row.code,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async function listMasters({ q, accountType, page, pageSize }) {
    await ensureInit();
    const where = [];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(master_name ILIKE $${params.length} OR code ILIKE $${params.length} OR group_name ILIKE $${params.length})`);
    }
    if (accountType) {
      params.push(accountType);
      where.push(`account_type = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRes = await pool.query(`SELECT COUNT(*)::int AS n FROM masters ${whereSql}`, params);
    const rowsRes = await pool.query(
      `SELECT * FROM masters ${whereSql} ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    return { items: rowsRes.rows.map(rowToSummary), total: totalRes.rows[0].n };
  }

  async function getMasterById(id) {
    await ensureInit();
    const res = await pool.query("SELECT * FROM masters WHERE id = $1", [id]);
    return res.rows[0] ? rowToRecord(res.rows[0]) : null;
  }

  async function createMaster(fields) {
    await ensureInit();
    const res = await pool.query(
      `INSERT INTO masters (master_name, account_type, group_name, code, data) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [fields.MasterName, fields.AccountType, fields.GroupName || null, fields.Code || null, JSON.stringify(fields)]
    );
    return rowToRecord(res.rows[0]);
  }

  async function updateMaster(id, fields) {
    await ensureInit();
    const res = await pool.query(
      `UPDATE masters SET master_name=$1, account_type=$2, group_name=$3, code=$4, data=$5, updated_at=now() WHERE id=$6 RETURNING *`,
      [fields.MasterName, fields.AccountType, fields.GroupName || null, fields.Code || null, JSON.stringify(fields), id]
    );
    return res.rows[0] ? rowToRecord(res.rows[0]) : null;
  }

  async function deleteMaster(id) {
    await ensureInit();
    const res = await pool.query("DELETE FROM masters WHERE id = $1", [id]);
    return res.rowCount > 0;
  }

  async function listAllFull() {
    await ensureInit();
    const res = await pool.query("SELECT * FROM masters ORDER BY id");
    return res.rows.map(rowToRecord);
  }

  return { listMasters, getMasterById, createMaster, updateMaster, deleteMaster, listAllFull };
}

module.exports = createPostgresStore;
