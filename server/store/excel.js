// The real database: a single .xlsx file on disk, kept on Render's
// persistent disk (DATA_DIR). The whole file is rewritten on every create/
// update/delete - simplest correct approach at this tool's scale (dozens to
// low thousands of masters), and it means the on-disk file is always a
// complete, readable spreadsheet rather than something edited cell-by-cell.
//
// Writes go through a temp-file-then-rename so a crash mid-write can never
// leave a half-written file behind, and every operation (reads included) is
// serialized through one in-process queue so two concurrent requests can't
// race on a read-modify-write and silently drop a record.
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE_PATH = path.join(DATA_DIR, "masters.xlsx");
const TMP_PATH = FILE_PATH + ".tmp";
const SHEET_NAME = "Masters";
const PRIORITY_COLUMNS = ["id", "MasterName", "AccountType", "GroupName", "Code", "createdAt", "updatedAt"];

let chain = Promise.resolve();
function enqueue(fn) {
  const result = chain.then(fn, fn);
  chain = result.then(() => {}, () => {});
  return result;
}

async function loadAll() {
  if (!fs.existsSync(FILE_PATH)) return [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) return [];

  const header = sheet.getRow(1).values; // 1-indexed; [0] is unused
  const records = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rec = {};
    row.values.forEach((value, i) => {
      const key = header[i];
      if (!key || value === null || value === undefined || value === "") return;
      rec[key] = key === "id" ? Number(value) : String(value);
    });
    if (rec.id !== undefined) records.push(rec);
  });
  return records;
}

async function saveAll(records) {
  const keys = new Set();
  records.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const rest = [...keys].filter((k) => !PRIORITY_COLUMNS.includes(k)).sort();
  const columns = [...PRIORITY_COLUMNS.filter((k) => keys.has(k)), ...rest];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = columns.map((c) => ({ header: c, key: c, width: Math.min(32, Math.max(10, c.length + 4)) }));
  sheet.getRow(1).font = { bold: true };
  // Force every non-id column to a text format so values that merely look
  // numeric (PIN codes, mobile numbers, GSTINs with leading digits) don't
  // get silently reinterpreted as numbers and lose leading zeros.
  columns.forEach((c) => { if (c !== "id") sheet.getColumn(c).numFmt = "@"; });
  records.forEach((r) => sheet.addRow(r));

  await workbook.xlsx.writeFile(TMP_PATH);
  await fs.promises.rename(TMP_PATH, FILE_PATH);
}

function toSummary(row) {
  return {
    id: row.id,
    masterName: row.MasterName ?? null,
    accountType: row.AccountType ?? null,
    groupName: row.GroupName ?? null,
    code: row.Code ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listMasters({ q, accountType, page, pageSize }) {
  return enqueue(async () => {
    let rows = await loadAll();
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) =>
        [r.MasterName, r.Code, r.GroupName].some((v) => v && String(v).toLowerCase().includes(needle))
      );
    }
    if (accountType) rows = rows.filter((r) => r.AccountType === accountType);
    rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    const total = rows.length;
    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize).map(toSummary);
    return { items, total };
  });
}

async function getMasterById(id) {
  return enqueue(async () => {
    const rows = await loadAll();
    return rows.find((r) => String(r.id) === String(id)) || null;
  });
}

async function createMaster(fields) {
  return enqueue(async () => {
    const rows = await loadAll();
    const nextId = rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
    const now = new Date().toISOString();
    const row = { ...fields, id: nextId, createdAt: now, updatedAt: now };
    rows.push(row);
    await saveAll(rows);
    return row;
  });
}

async function updateMaster(id, fields) {
  return enqueue(async () => {
    const rows = await loadAll();
    const idx = rows.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) return null;
    const updated = { ...fields, id: rows[idx].id, createdAt: rows[idx].createdAt, updatedAt: new Date().toISOString() };
    rows[idx] = updated;
    await saveAll(rows);
    return updated;
  });
}

async function deleteMaster(id) {
  return enqueue(async () => {
    const rows = await loadAll();
    const idx = rows.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) return false;
    rows.splice(idx, 1);
    await saveAll(rows);
    return true;
  });
}

async function listAllFull() {
  return enqueue(() => loadAll());
}

module.exports = { listMasters, getMasterById, createMaster, updateMaster, deleteMaster, listAllFull };
