const express = require("express");
const ExcelJS = require("exceljs");
const db = require("./db");
const {
  checkPassword,
  createSession,
  destroySession,
  sessionTokenFrom,
  isValidSession,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin,
} = require("./adminAuth");

const router = express.Router();

function rowToRecord(row) {
  const data = JSON.parse(row.data);
  return { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, ...data };
}

const PRIORITY_COLUMNS = ["id", "MasterName", "AccountType", "GroupName", "Code", "createdAt", "updatedAt"];

// Builds one consistent column list across every record, even though records
// can each have a different subset of fields filled in.
function allRecordsWithColumns() {
  const rows = db.prepare("SELECT * FROM masters ORDER BY id").all();
  const records = rows.map(rowToRecord);
  const keys = new Set();
  records.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const rest = [...keys].filter((k) => !PRIORITY_COLUMNS.includes(k)).sort();
  const columns = [...PRIORITY_COLUMNS.filter((k) => keys.has(k)), ...rest];
  return { records, columns };
}

router.post("/login", (req, res) => {
  if (!checkPassword((req.body || {}).password)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  setSessionCookie(res, createSession());
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  destroySession(sessionTokenFrom(req));
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.json({ loggedIn: isValidSession(sessionTokenFrom(req)) });
});

// Full data for every saved master, for the on-screen admin table.
router.get("/masters", requireAdmin, (req, res) => {
  const { records, columns } = allRecordsWithColumns();
  res.json({ columns, records });
});

router.get("/export.xlsx", requireAdmin, async (req, res) => {
  const { records, columns } = allRecordsWithColumns();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Masters");
  sheet.columns = columns.map((c) => ({ header: c, key: c, width: Math.min(32, Math.max(10, c.length + 4)) }));
  sheet.getRow(1).font = { bold: true };
  records.forEach((r) => sheet.addRow(r));

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `erp-masters-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

module.exports = router;
