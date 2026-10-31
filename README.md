# ERP Master Creation (Customer / Vendor)

A Customer/Vendor master-creation screen for an ERP system, with full field
validation (GSTIN/PAN/IFSC/PIN checks, director/executive matching, PAN-to-
assessee-type inference, etc.) and a backend that persists every accepted
record so it can be listed, edited and deleted later.

Every record is stored directly in a spreadsheet — a Google Sheet in
production, or a local `.xlsx` file for local development. There is no
separate database to manage: the admin view, the "Open in Google Sheets"
link, and the Excel export are all views of the same data, not copies of it.

## Structure

- `public/index.html` — the master-creation form (all client-side validation
  logic lives here, unchanged from the original screen, plus the save/edit
  wiring to the API).
- `public/masters.html` — list/search view of saved masters, with Edit and
  Delete actions.
- `public/admin.html` — password-protected admin view: every field of every
  saved master in one table, a link to open the live Google Sheet, and an
  Excel download button.
- `server/app.js` — the Express app (routes + static file serving).
- `server/index.js` — entry point: runs `app.js` as a long-running process.
- `server/store/` — the storage layer every route goes through
  (`listMasters`/`getMasterById`/`createMaster`/`updateMaster`/`deleteMaster`/
  `listAllFull`), never a spreadsheet client directly:
  - `googlesheets.js` — stores data in a Google Sheet via the Sheets API.
    Used whenever `GOOGLE_SHEET_ID` is set (the production path).
  - `excel.js` — stores data in a local `data/masters.xlsx` file. Used when
    `GOOGLE_SHEET_ID` is not set, so `npm start` works immediately for local
    development without any Google setup.
- `server/masters.js`, `server/admin.js`, `server/adminAuth.js` — the routes.

## How storage works

Each create/update/delete reads the whole sheet/file, changes it in memory,
and writes the whole thing back out — header row plus every record — rather
than editing cells in place. At this tool's scale (an internal customer/
vendor list — dozens to low thousands of rows) that's simple and fast, and it
means what's on disk/in the Sheet is always a complete, valid spreadsheet
rather than something partially patched. All operations are serialized
through an in-process queue so two requests saving at the same moment can't
race and silently drop a record. Values are written in a way that keeps PIN
codes, phone numbers, etc. as text, so a leading zero is never silently lost.

**Don't hand-edit the Google Sheet or `masters.xlsx` while the app is
running.** Both are treated as live data — the next save overwrites
everything from what the app currently has, so a manual edit made in between
would be lost. (Opening the Sheet to *look* at it is completely fine and
expected — that's the point.)

## Running locally

```bash
npm install
npm start
```

No Google setup is needed for this — with `GOOGLE_SHEET_ID` unset, data
saves to a local `data/masters.xlsx` file instead. Then open
http://localhost:3000 — "Accept" saves the record, "View all masters" (top
right) lists/edits/deletes records, and "Admin" opens the full-data view
(password: set `ADMIN_PASSWORD` in your environment; defaults to `admin123`
locally if unset — change this before deploying anywhere real).

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
| GET    | `/api/admin/me`         | `{loggedIn, sheetUrl}` — `sheetUrl` is set once logged in, if `GOOGLE_SHEET_ID` is configured |
| GET    | `/api/admin/masters`    | Every field of every record (session required)  |
| GET    | `/api/admin/export.xlsx`| Downloads everything as an .xlsx file (session required) |

## One-time Google Sheets setup

This only needs doing once, by whoever first deploys the app. The three
values you end up with (`GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_PRIVATE_KEY`) get set as environment variables on Render — never
commit them to the repo or paste them in chat.

1. **Create a Google Cloud project**: go to
   [console.cloud.google.com](https://console.cloud.google.com), create a
   new project (any name).
2. **Enable the Sheets API**: in that project, go to "APIs & Services" →
   "Library", search for "Google Sheets API", click it, click **Enable**.
3. **Create a service account**: "APIs & Services" → "Credentials" →
   **Create Credentials** → **Service account**. Give it any name, skip the
   optional role/access steps, click **Done**.
4. **Create a key for it**: open the service account you just created → the
   **Keys** tab → **Add Key** → **Create new key** → **JSON**. This
   downloads a `.json` file — keep it private, you'll need two values out of
   it:
   - `client_email` → this is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this is your `GOOGLE_PRIVATE_KEY` (it's a long string
     starting with `-----BEGIN PRIVATE KEY-----`; paste it exactly as-is,
     newlines included, into the Render environment variable)
5. **Create the spreadsheet**: go to [sheets.google.com](https://sheets.google.com),
   create a new blank spreadsheet (name it anything, e.g. "ERP Masters").
   Copy its **Sheet ID** out of the URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit` → this is
   your `GOOGLE_SHEET_ID`.
6. **Share the spreadsheet with the service account**: in the spreadsheet,
   click **Share**, paste in the `client_email` address from step 4, give it
   **Editor** access. (It won't show up as a real person — that's expected,
   it's a robot account.)

You now have the three values needed below.

## Deploying to Render

This repo includes a `render.yaml` blueprint for a single Node web service.
No persistent disk is needed — data lives in the Google Sheet, not on disk —
so this works on Render's **free** tier.

1. Finish the Google Sheets setup above if you haven't.
2. Push this repo to GitHub (already done if you're reading this from the repo).
3. In the Render dashboard: **New +** → **Blueprint**, pick this repo/branch.
4. Render reads `render.yaml` and prompts for four environment variables:
   - `ADMIN_PASSWORD` — choose a real password (the login for `/admin.html`)
   - `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
     — from the setup above
5. Click **Apply** / **Deploy**.
6. Once deployed, Render gives you a `https://erp-master-screen-xxxx.onrender.com`
   URL — that's the live app (form at `/`, saved masters at `/masters.html`,
   admin view at `/admin.html`). Open the Sheet itself any time from the
   Admin page's "Open in Google Sheets" link, or directly at
   `https://docs.google.com/spreadsheets/d/<your sheet id>/edit`.

### Notes

- The free Render plan spins the service down after inactivity; the first
  request after idling takes a few extra seconds to wake it back up. Data
  isn't affected either way, since it lives in the Sheet, not on the
  service's own disk.
- There is no login on the main form or the masters list — anyone with the
  URL can create, view, edit and delete masters. Only `/admin.html` (full
  data view + Sheet link + Excel export) is password-protected, via the
  `ADMIN_PASSWORD` environment variable.
- Every list/view in the app makes a live call to the Google Sheets API
  (there's no caching). Fine for normal use, but very heavy concurrent usage
  could hit Google's API rate limits.
