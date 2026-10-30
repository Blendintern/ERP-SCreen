// Vercel serverless entry point: every request to /api/* (see vercel.json's
// rewrite) is handled by this one Express app instance. No app.listen() here
// - Vercel's Node runtime calls the exported handler directly per request.
module.exports = require("../server/app");
