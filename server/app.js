const path = require("path");
const express = require("express");
const mastersRouter = require("./masters");
const adminRouter = require("./admin");

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/masters", mastersRouter);
app.use("/api/admin", adminRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

// Any non-API route falls back to the SPA shell so deep links work.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

module.exports = app;
