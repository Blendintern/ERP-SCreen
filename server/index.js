// Entry point: runs the app (server/app.js) as a long-running process, on
// Render or locally.
const app = require("./app");
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ERP master screen listening on port ${PORT}`);
});
