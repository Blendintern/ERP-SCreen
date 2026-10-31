# ERP Master Creation (Customer / Vendor)

A Customer/Vendor master-creation screen for an ERP system, with full field
validation (GSTIN/PAN/IFSC/PIN checks, director/executive matching, PAN-to-
assessee-type inference, etc.) and a backend that persists every accepted
record so it can be listed, edited and deleted later. Every record is stored
directly in a single `.xlsx` file on disk — the admin view and the database
are the same data, not an export of it.

## Structure

- `public/index.html` — the master-creation form (all client-side validation
  logic lives here, unchanged from the original screen, plus the save/edit
  wiring to the API).
- `public/masters.html` — list/search view of saved masters, with Edit and
  Delete actions.
- `public/admin.html` — password-protected admin view: every field of every
  saved master in one table, with a button to download the live file.
- `server/app.js` — the Express app (routes + static file serving).
- `server/index.js` — entry point: runs `app.js` as a long-running process.
- `server/store/excel.js` — the database: reads/writes `data/masters.xlsx`.
  Every route goes through `server/store/index.js`'s interface
  (`listMasters`/`getMasterById`/`createMaster`/`updateMaster`/`deleteMaster`/
  `listAllFull`), never the file directly.
- `server/masters.js`, `server/admin.js`, `server/adminAuth.js` — the routes.
- `data/masters.xlsx` — the actual data, created automatically on first save.
  Not committed to git.

## How storage works

There's no separate database engine — `data/masters.xlsx` *is* the data.
Each create/update/delete reads the whole file, changes it in memory, and
writes it back out (via a temp-file-then-rename, so a crash mid-write can't
corrupt it), serialized through an in-process queue so two requests saving at
the same moment can't race and silently drop a record. At this tool's scale
(an internal customer/vendor list — dozens to low thousands of rows) rewriting
the whole file on every save is fast and simple, and it means the file on
disk is always a complete, valid spreadsheet you can open directly.

**Don't hand-edit `masters.xlsx` while the app is running.** It's treated as
live data — the next save overwrites the whole file from what the app has in
memory, so a manual edit made in between would be lost.

## Running locally

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
| GET    | `/api/admin/export.xlsx`| Downloads the current `masters.xlsx` (session required) |

## Deploying to Render

This repo includes a `render.yaml` blueprint: a single Node web service with
a 1 GB persistent disk mounted at `/var/data` for `masters.xlsx`.

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the Render dashboard: **New +** → **Blueprint**, pick this repo/branch.
3. Render reads `render.yaml` and creates the `erp-master-screen` web service
   with the disk already attached. It will prompt you to enter a value for
   `ADMIN_PASSWORD` — choose a real password here (this becomes the login for
   the `/admin.html` page). Click **Apply** / **Deploy**.
4. Once deployed, Render gives you a `https://erp-master-screen-xxxx.onrender.com`
   URL — that's the live app (form at `/`, saved masters at `/masters.html`,
   admin view at `/admin.html`).

Data lives on the attached disk, so it survives restarts and redeploys as
long as the disk isn't deleted.

**This app needs a platform with a persistent disk — it will not work on a
platform that only runs short-lived serverless functions (e.g. Vercel),
since the `.xlsx` file would be wiped on every deploy and couldn't reliably
persist between requests.** Render, a traditional VPS, or any other
always-on host with writable disk storage all work fine.

### Notes

- The free Render plan spins the service down after inactivity; the first
  request after idling takes a few extra seconds to wake it back up.
- There is no login on the main form or the masters list — anyone with the
  URL can create, view, edit and delete masters. Only `/admin.html` (full
  data view + download) is password-protected, via the `ADMIN_PASSWORD`
  environment variable.
