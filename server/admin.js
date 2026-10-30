const express = require("express");
const ExcelJS = require("exceljs");
const store = require("./store");
const {
  checkPassword,
  createSessionToken,
  sessionTokenFrom,
  isValidToken,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin,
} = require("./adminAuth");

const router = express.Router();

const PRIORITY_COLUMNS = ["id", "MasterName", "AccountType", "GroupName", "Code", "createdAt", "updatedAt"];

// Builds one consistent column list across every record, even though records
// can each have a different subset of fields filled in.
async function allRecordsWithColumns() {
  const records = await store.listAllFull();
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
  setSessionCookie(res, createSessionToken());
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.json({ loggedIn: isValidToken(sessionTokenFrom(req)) });
});

// Full data for every saved master, for the on-screen admin table.
router.get("/masters", requireAdmin, async (req, res, next) => {
  try {
    const { records, columns } = await allRecordsWithColumns();
    res.json({ columns, records });
  } catch (err) { next(err); }
});

router.get("/export.xlsx", requireAdmin, async (req, res, next) => {
  try {
    const { records, columns } = await allRecordsWithColumns();

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
  } catch (err) { next(err); }
});

module.exports = router;
