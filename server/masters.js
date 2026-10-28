const express = require("express");
const db = require("./db");

const router = express.Router();

const ACCOUNT_TYPES = ["Debtor", "Creditor", "Income", "Expense", "Asset", "Liability"];

function rowToRecord(row) {
  const data = JSON.parse(row.data);
  return { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, ...data };
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

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Body must be a JSON object.";
  if (!body.MasterName || !String(body.MasterName).trim()) return "Master Name is required.";
  if (!body.AccountType || !ACCOUNT_TYPES.includes(body.AccountType)) {
    return `Account Type must be one of: ${ACCOUNT_TYPES.join(", ")}.`;
  }
  return null;
}

// GET /api/masters?q=&accountType=&page=&pageSize=
router.get("/", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const q = (req.query.q || "").trim();
  const accountType = (req.query.accountType || "").trim();

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
    .prepare(
      `SELECT * FROM masters ${whereSql} ORDER BY updated_at DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({ items: rows.map(rowToSummary), total, page, pageSize });
});

// GET /api/masters/:id
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM masters WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found." });
  res.json(rowToRecord(row));
});

// POST /api/masters
router.post("/", (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO masters (master_name, account_type, group_name, code, data, created_at, updated_at)
       VALUES (@master_name, @account_type, @group_name, @code, @data, @now, @now)`
    )
    .run({
      master_name: req.body.MasterName,
      account_type: req.body.AccountType,
      group_name: req.body.GroupName || null,
      code: req.body.Code || null,
      data: JSON.stringify(req.body),
      now,
    });

  const row = db.prepare("SELECT * FROM masters WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(rowToRecord(row));
});

// PUT /api/masters/:id
router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT id FROM masters WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found." });

  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE masters SET master_name=@master_name, account_type=@account_type, group_name=@group_name,
       code=@code, data=@data, updated_at=@now WHERE id=@id`
  ).run({
    id: req.params.id,
    master_name: req.body.MasterName,
    account_type: req.body.AccountType,
    group_name: req.body.GroupName || null,
    code: req.body.Code || null,
    data: JSON.stringify(req.body),
    now,
  });

  const row = db.prepare("SELECT * FROM masters WHERE id = ?").get(req.params.id);
  res.json(rowToRecord(row));
});

// DELETE /api/masters/:id
router.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM masters WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found." });
  res.status(204).end();
});

module.exports = router;
