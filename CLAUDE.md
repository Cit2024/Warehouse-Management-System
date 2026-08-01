# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Warehouse management desktop app (منظومة المخازن) for the Misrata Industrial Technical College. Electron + better-sqlite3, fully local, no server. UI is 100% Arabic RTL. See `PRODUCT.md` for the design constraints (no dark mode, no SaaS-style decoration, WCAG 2.1 AA, status never conveyed by color alone) and `DESIGN.md` for the concrete design system (colors, type, components).

## Commands

```bash
npm install          # postinstall runs electron-builder install-app-deps (rebuilds better-sqlite3 for Electron)
npm start            # run app in dev mode — DevTools open, Ctrl+Shift+S forces a local backup
npm run build:win    # NSIS installer
npm run build:linux  # AppImage       (build:linux-deb for .deb)
```

Tests are plain Node scripts with hand-rolled asserts and mocked DOM — no runner, no `npm test`. Each exits non-zero on failure.

**Two runners, and picking the wrong one looks like a broken test.** `better-sqlite3` is a native module compiled against Electron's ABI, so plain `node` cannot open a database — it dies with `ERR_DLOPEN_FAILED`. Anything touching SQLite must run under Electron's Node:

```bash
# DOM/component tests — plain node:
#   addEntityModal, addItemModal, ipcBridge, printLayout, printModal, printReport
node tests/printReport.test.js

# anything requiring better-sqlite3 — Electron's node:
#   auth, dbMigration, gitBackup, stockGuard, users, void
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron tests/void.test.js
```

The same applies to one-off scripts: reach for `ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e '...'` whenever you want to poke at a database.

CI (`.github/workflows/ci.yml`) uses **bun**, not npm, and only builds installers; it does not run the tests. Pushes to `main` refresh a rolling `continuous` prerelease; `release.yml` fires on `v*` tags and attaches the NSIS/AppImage/.deb builds to a GitHub release.

`scripts/capture-screenshots.js` and `capture-report-previews.js` regenerate the README screenshots in `placeholders/` — a third runner variant: `xvfb-run -a node_modules/.bin/electron scripts/capture-screenshots.js`.

## Architecture

**Three layers, no bundler and no framework anywhere.**

1. `main.js` (~1700 lines) — IPC surface and OS integration. Every `ipcMain.handle(...)` is a data-access or OS operation, most SQL written inline. Handlers return either raw rows or `{ success, message }`. Pure logic that needs unit tests is extracted into `database/` modules (below).
2. `preload.js` — `contextBridge` exposes each handler on `window.api`. `contextIsolation: true`, `nodeIntegration: false`.
3. Renderer — one HTML file per page (`items.html`, `supply.html`, `users.html`, …), each pulling in `assets/js/common.js`, a fixed list of `assets/js/components/*.js`, and its `assets/js/pages/<page>.js` via plain `<script>` tags. Everything is a global class or function; there are no ES modules. Every page carries the same `Content-Security-Policy` `<meta>` at line 6 (`default-src 'self'`, no CDN) — a new page needs that line too.

**Adding a feature that touches data means editing four places**: an `ipcMain.handle` in `main.js`, a role guard on that handler if it mutates (`checkWriteAccess()` / `requireAdmin()`), a one-line bridge in `preload.js`, and the caller in `assets/js/pages/`. Forgetting the preload line is the usual failure — `tests/ipcBridge.test.js` catches it.

### Database (`database/`)

`db.js` owns the connection and schema; pure logic lives in sibling modules that take `db` as a parameter and never touch Electron, so they run under any Node: `auth.js` (scrypt hash/verify), `users.js` (user CRUD, `VALID_ROLES`), `stock.js` (receipt validation, negative-stock guard, voiding), `migrations.js` (named migrations + `checkIntegrity`).

- `db.js`'s `module.exports` is a **Proxy** that opens the connection lazily on first property access, so `db.prepare(...)` works while the file is still safe to `require` before `app.whenReady()`. Opening it early would create the SQLite file in a temp dir. `main.js` requires it inside `whenReady()` and calls `initializeDatabase()`. WAL mode, `foreign_keys = ON`; `closeDb`/`reopenDb` exist for restore; boot refuses to proceed if the database is mid-transaction.
- Schema is created idempotently (`CREATE TABLE IF NOT EXISTS`) on every boot; migrations are named functions in `migrations.js`, invoked from `initializeDatabase()`. Seed data (admin/admin, one store, one supplier) is inserted only when `users` is empty.
- **Stock is never stored.** `view_current_stock` derives `current_quantity` as `SUM(In + Opening_Balance) - SUM(Out)` over `transaction_details`, excluding voided receipts. Never add a quantity column to `items`.
- **Unit price is never stored on `items`** either — queries derive it with a correlated subquery for the most recent `'In'` transaction with `unit_price > 0`. `Out` rows are written with `unit_price = 0`.
- **Soft delete everywhere** (`is_deleted = 1`); every read filters on `is_deleted = 0`. Hard deletes would break the accounting ledger.
- Receipts are written inside a `db.transaction(...)` (header into `transactions`, lines into `transaction_details`) so a partial receipt can never land. `validateReceiptItems`/`assertNoNegativeStock` (`stock.js`) enforce non-negative stock in the main process — renderer checks are cosmetic.
- **Voiding**: `void-transaction` IPC → `voidTransaction` in `stock.js` — soft delete with reason/actor/timestamp, then re-asserts stock and rolls back if voiding an `In` receipt would push any balance negative (`tests/void.test.js`).
- **Schema gotcha**: the void columns (`void_reason`, `voided_by`, `voided_at`) must stay **last** in the `transactions` CREATE — the backup SQL dump copies `sqlite_master.sql` verbatim, and ALTER-added columns land at the end, so reordering breaks restore of old dumps.
- `get-db-health` IPC → `checkIntegrity` (`migrations.js`), surfaced on the dashboard.

### Auth, session & roles

`hashPassword`/`verifyPassword` in `database/auth.js` use scrypt (`scrypt:<salt>:<hash>`). Legacy plaintext hashes still validate and are silently re-hashed on the next successful login.

**The main process is the authority.** `currentSession` in `main.js` is set by the `login` handler and cleared by `logout`. Two roles only: `Admin` and `Store_Keeper` — the `Viewer` role was removed, and the `migrateRemoveViewerRole` migration converts any legacy Viewer users to `Store_Keeper` on boot. Both roles can write, so `checkWriteAccess()` now only requires a logged-in session; `requireAdmin()` guards user management, manual backup/restore, and password changes (own or others'). The renderer's `localStorage.userSession` + `checkSession()` in `common.js` only gate navigation; there's a 10-minute idle auto-logout. Sensitive actions (backup, restore) go through `promptForPassword()`, which re-verifies via the `login` IPC.

### Backup & cloud sync (`gitManager.js` + `main.js`)

Backups are a git repo in `userData/CloudBackupRepo` driven by `isomorphic-git`. `generateSQLDump()` dumps the SQLite database to `database_dump.sql`, which is the only file committed; each backup is a commit, and restore = checkout that commit + rebuild + `app.relaunch()`.

**Cloud push is currently disabled** by the `CLOUD_SYNC_ENABLED = false` kill-switch in `main.js` — the old push path force-pushed after transient network failures, letting one machine erase every other machine's history. The GitHub URL/PAT config in `userData/system_config.json` and the push code remain in place behind the flag. Auto-backup itself still runs locally: an hourly tick compares elapsed time against the configured interval (default 14 days) — a single long `setInterval` would overflow Node's 2^31−1 ms cap.

Note the near-identical sync logic duplicated between the `sync-with-cloud` IPC handler and `performAutoBackup()` in `main.js` (both currently dead behind the flag) — fix both when touching either.

### Printing (`assets/js/components/printReport.js`)

`window.printReport` is the single global that all pages print through — it builds a standalone HTML document, opens a popup, and prints it. Per-type entry points: `printInventoryTable`, `printReceipt`, `printDashboardSummary`, `printMovementsTable`, `printSuppliersTable`, `printItemCard`. Column layouts and A4 landscape/portrait rules differ per type; do not hand-roll a new print path in a page script. Official documents carry signature blocks (`printSignatures.js`). `assets/css/print.css` holds the `@media print` rules. Voided receipts are excluded from printed reports.

`generate-report` (PDF) and `print-direct` in `main.js` print the *live page* via `webContents`, which is a separate, older path from `printReport`.

## Conventions

- Comments, UI strings, and toast/error messages are in Arabic. Console logs mix Arabic with emoji prefixes. Match the surrounding language when editing a file.
- Numbers are formatted with the `ar-LY` locale (dot = thousands, comma = decimal); `parseArabicNumber()` in `common.js` reverses this for table sorting.
- Any DB-sourced string rendered into HTML goes through `escapeHtml()` in `common.js`.
- Native `alert`/`confirm`/`prompt` are silent no-ops in this Electron config — use `showToast()`, `confirmModal()`, `promptForText()` from `common.js`.
- No charting library. Chart.js was deliberately removed (dashboard uses ranked lists and plain stat cards); do not reintroduce one.
- Dev DevTools open automatically when `!app.isPackaged`.
