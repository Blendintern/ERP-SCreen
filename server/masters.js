const express = require("express");
const store = require("./store");

const router = express.Router();

const ACCOUNT_TYPES = ["Debtor", "Creditor", "Income", "Expense", "Asset", "Liability"];

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Body must be a JSON object.";
  if (!body.MasterName || !String(body.MasterName).trim()) return "Master Name is required.";
  if (!body.AccountType || !ACCOUNT_TYPES.includes(body.AccountType)) {
    return `Account Type must be one of: ${ACCOUNT_TYPES.join(", ")}.`;
  }
  return null;
}

// GET /api/masters?q=&accountType=&page=&pageSize=
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const q = (req.query.q || "").trim();
    const accountType = (req.query.accountType || "").trim();
    const { items, total } = await store.listMasters({ q, accountType, page, pageSize });
    res.json({ items, total, page, pageSize });
  } catch (err) { next(err); }
});

// GET /api/masters/:id
router.get("/:id", async (req, res, next) => {
  try {
    const rec = await store.getMasterById(req.params.id);
    if (!rec) return res.status(404).json({ error: "Not found." });
    res.json(rec);
  } catch (err) { next(err); }
});

// POST /api/masters
router.post("/", async (req, res, next) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const rec = await store.createMaster(req.body);
    res.status(201).json(rec);
  } catch (err) { next(err); }
});

// PUT /api/masters/:id
router.put("/:id", async (req, res, next) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const rec = await store.updateMaster(req.params.id, req.body);
    if (!rec) return res.status(404).json({ error: "Not found." });
    res.json(rec);
  } catch (err) { next(err); }
});

// DELETE /api/masters/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const ok = await store.deleteMaster(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found." });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
