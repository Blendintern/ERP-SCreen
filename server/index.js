const path = require("path");
const express = require("express");
const mastersRouter = require("./masters");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/masters", mastersRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

// Any non-API route falls back to the SPA shell so deep links (e.g. /masters.html) work.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ERP master screen listening on port ${PORT}`);
});
