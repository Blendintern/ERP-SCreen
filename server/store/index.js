// Picks the storage backend at require-time: a Google Sheet when
// GOOGLE_SHEET_ID (+ service account credentials) is set - the production
// path, since it needs no local disk and works on free-tier hosting -
// otherwise a local .xlsx file (server/store/excel.js), which is simpler for
// local development but does need a persistent disk to deploy anywhere.
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

module.exports = SHEET_ID ? require("./googlesheets")(SHEET_ID) : require("./excel");
