// Picks the storage backend at require-time: a hosted Postgres database when
// DATABASE_URL/POSTGRES_URL is set (Vercel, or any platform without a
// writable persistent disk), otherwise the local SQLite file (Render, local
// dev). The two are interchangeable because both implement the same
// listMasters/getMasterById/createMaster/updateMaster/deleteMaster/listAllFull
// interface - see server/store/sqlite.js and server/store/postgres.js.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

module.exports = connectionString ? require("./postgres")(connectionString) : require("./sqlite");
