// Stores every master directly in a Google Sheet via the Sheets API - no
// local disk at all, so this works on Render's free tier (which has no
// persistent disk) or anywhere else. The data a user opens in Google Sheets
// IS the database, not an export of it.
//
// Same strategy as server/store/excel.js: every create/update/delete reads
// the whole sheet, changes it in memory, and rewrites the whole sheet back
// (header + all rows) in one call. Simple and correct at this tool's scale;
// avoids needing to track which spreadsheet column letter maps to which
// field as the set of fields used grows over time.
//
// Exported as a factory so a fake Sheets client can be substituted in tests
// without real Google credentials - see the `sheets` parameter.
const { google } = require("googleapis");

const SHEET_NAME = "Masters";
const PRIORITY_COLUMNS = ["id", "MasterName", "AccountType", "GroupName", "Code", "createdAt", "updatedAt"];

function createGoogleSheetsStore(spreadsheetId, { sheets } = {}) {
  if (!sheets) {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheets = google.sheets({ version: "v4", auth });
  }

  let chain = Promise.resolve();
  function enqueue(fn) {
    const result = chain.then(fn, fn);
    chain = result.then(() => {}, () => {});
    return result;
  }

  async function ensureSheetExists() {
    try {
      await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A1` });
    } catch (err) {
      // Sheet/tab doesn't exist yet - create it so the first save has somewhere to write.
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
      });
    }
  }

  async function loadAll() {
    await ensureSheetExists();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A:ZZ` });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];
    const header = rows[0];
    return rows.slice(1).map((row) => {
      const rec = {};
      header.forEach((key, i) => {
        const value = row[i];
        if (!key || value === undefined || value === "") return;
        rec[key] = key === "id" ? Number(value) : String(value);
      });
      return rec;
    }).filter((r) => r.id !== undefined);
  }

  async function saveAll(records) {
    const keys = new Set();
    records.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    const rest = [...keys].filter((k) => !PRIORITY_COLUMNS.includes(k)).sort();
    const columns = [...PRIORITY_COLUMNS.filter((k) => keys.has(k)), ...rest];

    const values = [columns, ...records.map((r) => columns.map((c) => (r[c] !== undefined ? String(r[c]) : "")))];

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: SHEET_NAME });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      // RAW: values are stored exactly as given, never auto-parsed as a
      // number/date - otherwise a PIN code or phone number with a leading
      // zero would silently lose it.
      valueInputOption: "RAW",
      requestBody: { values },
    });
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

  return { listMasters, getMasterById, createMaster, updateMaster, deleteMaster, listAllFull };
}

module.exports = createGoogleSheetsStore;
