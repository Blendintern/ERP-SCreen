// Entry point for Render and local development (a long-running process).
// Vercel uses api/index.js instead, which imports the same app without
// calling listen() - see server/app.js for the shared Express app.
const app = require("./app");
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ERP master screen listening on port ${PORT}`);
});
