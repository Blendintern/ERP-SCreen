# ERP Master Creation (Customer / Vendor)

A Customer/Vendor master-creation screen for an ERP system, with full field
validation (GSTIN/PAN/IFSC/PIN checks, director/executive matching, PAN-to-
assessee-type inference, etc.) and a backend that persists every accepted
record so it can be listed, edited and deleted later. Deployable as-is to
either [Render](#deploying-to-render) (SQLite on a persistent disk) or
[Vercel](#deploying-to-vercel) (hosted Postgres) — same code, same API,
different storage underneath.

## Structure

- `public/index.html` — the master-creation form (all client-side validation
  logic lives here, unchanged from the original screen, plus the save/edit
  wiring to the API).
- `public/masters.html` — list/search view of saved masters, with Edit and
  Delete actions.
- `public/admin.html` — password-protected admin view: every field of every
  saved master in one table, with an **Export to Excel** button.
- `server/app.js` — the Express app (routes + static file serving), shared by
  both deploy targets below.
- `server/index.js` — entry point for Render/local dev: runs `app.js` as a
  long-running process.
- `api/index.js` — entry point for Vercel: the same `app.js`, run as a
  serverless function (see `vercel.json`).
- `server/store/` — the storage layer, swappable per deployment:
  `sqlite.js` (local file, used on Render/local) or `postgres.js` (hosted
  database, used on Vercel). `server/store/index.js` picks one automatically
  based on whether `DATABASE_URL`/`POSTGRES_URL` is set. Every route goes
  through this interface, never the database driver directly.
- `server/masters.js`, `server/admin.js`, `server/adminAuth.js` — the routes.
- `data/` — SQLite database file (created automatically on Render/local; not
  committed, and not used at all on Vercel).

## Running locally

Requires Node.js 24+ (uses the built-in `node:sqlite` module, so there are no
native dependencies to compile).

```bash
npm install
npm start
```

Then open http://localhost:3000 — "Accept" saves the record to the server,
"View all masters" (top right) lists, edits and deletes saved records, and
"Admin" opens the full-data view (password: set `ADMIN_PASSWORD` in your
environment; defaults to `admin123` locally if unset — change this before
deploying anywhere real).

## API

| Method | Path                | Description                              |
|--------|---------------------|-------------------------------------------|
| GET    | `/api/health`        | Health check                              |
| GET    | `/api/masters`       | List, with `?q=`, `?accountType=`, `?page=`, `?pageSize=` |
| GET    | `/api/masters/:id`   | Fetch one full record                     |
| POST   | `/api/masters`       | Create (body = the field map the form produces) |
| PUT    | `/api/masters/:id`   | Update                                    |
| DELETE | `/api/masters/:id`   | Delete                                    |

A record only needs `MasterName` and a valid `AccountType`
(`Debtor`/`Creditor`/`Income`/`Expense`/`Asset`/`Liability`) server-side —
the full field-level validation (required fields per account type, GSTIN
checksum, etc.) runs in the browser before a save is attempted.

### Admin API

| Method | Path                    | Description                                    |
|--------|-------------------------|-------------------------------------------------|
| POST   | `/api/admin/login`      | Body `{password}`; sets a session cookie        |
| POST   | `/api/admin/logout`     | Clears the session                              |
| GET    | `/api/admin/me`         | `{loggedIn: true/false}`                        |
| GET    | `/api/admin/masters`    | Every field of every record (session required)  |
| GET    | `/api/admin/export.xlsx`| Downloads everything as an .xlsx file (session required) |

## Deploying to Render

This repo includes a `render.yaml` blueprint: a single Node web service with
a 1 GB persistent disk mounted at `/var/data` for the SQLite file.

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the Render dashboard: **New +** → **Blueprint**, pick this repo/branch.
3. Render reads `render.yaml` and creates the `erp-master-screen` web service
   with the disk already attached. It will prompt you to enter a value for
   `ADMIN_PASSWORD` — choose a real password here (this becomes the login for
   the `/admin.html` page). Click **Apply** / **Deploy**.
4. Once deployed, Render gives you a `https://erp-master-screen-xxxx.onrender.com`
   URL — that's the live app (form at `/`, saved masters at `/masters.html`,
   admin view at `/admin.html`).

No database setup is required — SQLite lives on the attached disk, so data
survives restarts and redeploys as long as the disk isn't deleted.

### Notes

- The free Render plan spins the service down after inactivity; the first
  request after idling takes a few extra seconds to wake it back up.
- There is no login on the main form or the masters list — anyone with the
  URL can create, view, edit and delete masters. Only `/admin.html` (full
  data view + Excel export) is password-protected, via the `ADMIN_PASSWORD`
  environment variable.

## Deploying to Vercel

Vercel runs code as short-lived serverless functions with no persistent
local disk, so the SQLite file used on Render won't work there — data would
disappear on every redeploy. Instead, on Vercel this app uses a hosted
Postgres database (see `server/store/postgres.js`).

1. **Create a Postgres database.** Easiest: in your Vercel project →
   **Storage** tab → **Create Database** → **Postgres**, then **Connect** it
   to this project. That automatically sets a `POSTGRES_URL` environment
   variable for you (or `DATABASE_URL`, which also works — either name is
   read). Any other hosted Postgres (Neon, Supabase, etc.) works too; just
   set its connection string as `DATABASE_URL` yourself.
2. **Set `ADMIN_PASSWORD`** in the project's Environment Variables (Settings
   → Environment Variables) — this is the login for `/admin.html`.
3. (Optional) Set `SESSION_SECRET` to a random string. If you skip it, a
   secret is derived from `ADMIN_PASSWORD`, which is fine for this tool but
   a dedicated secret is slightly stronger.
4. Import this repo into Vercel (**Add New** → **Project** → pick the repo).
   Vercel detects `vercel.json` automatically — no build command needed.
5. Deploy. The app is served the same way as on Render: form at `/`, masters
   list at `/masters.html`, admin view at `/admin.html`, API under `/api/*`.

### Notes

- Each serverless invocation can land on a different instance, so the admin
  login uses a signed, stateless cookie (expiry + HMAC, no server-side
  session store) rather than an in-memory session — this is required for
  Vercel to work at all, and it also makes the Render deployment slightly
  more robust (a restart no longer logs everyone out early).
- The very first request after a cold start runs a one-time
  `CREATE TABLE IF NOT EXISTS` against Postgres; harmless, just adds a little
  latency to that one request.
