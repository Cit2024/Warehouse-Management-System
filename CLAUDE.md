# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Warehouse management desktop app (منظومة المخازن) for the Misrata Industrial Technical College. Electron + better-sqlite3, fully local, no server. UI is 100% Arabic RTL. See `PRODUCT.md` for the design constraints (no dark mode, no SaaS-style decoration, WCAG 2.1 AA, status never conveyed by color alone).

## Commands

```bash
npm install          # postinstall runs electron-builder install-app-deps (rebuilds better-sqlite3 for Electron)
npm start            # run app in dev mode — DevTools open, Ctrl+Shift+S forces a cloud backup
npm run build:win    # NSIS installer
npm run build:linux  # AppImage       (build:linux-deb for .deb)
```

Tests are plain Node scripts with hand-rolled asserts and mocked DOM — no runner, no `npm test`. Each exits non-zero on failure.

**Two runners, and picking the wrong one looks like a broken test.** `better-sqlite3` is a native module compiled against Electron's ABI, so plain `node` cannot open a database — it dies with `ERR_DLOPEN_FAILED`. Anything touching SQLite must run under Electron's Node:

```bash
node tests/printReport.test.js                                   # DOM/component tests — plain node
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron tests/x.test.js   # anything requiring better-sqlite3
```

The same applies to one-off scripts: reach for `ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e '...'` whenever you want to poke at a database.

CI (`.github/workflows/`) uses **bun**, not npm, and only builds installers; it does not run the tests.

## Architecture

**Three layers, no bundler and no framework anywhere.**

1. `main.js` (~1400 lines) — the entire backend. Every `ipcMain.handle(...)` is a data-access or OS operation, with SQL written inline. Handlers return either raw rows or `{ success, message }`.
2. `preload.js` — `contextBridge` exposes each handler on `window.api`. `contextIsolation: true`, `nodeIntegration: false`.
3. Renderer — one HTML file per page (`items.html`, `supply.html`, …), each pulling in `assets/js/common.js`, a fixed list of `assets/js/components/*.js`, and its `assets/js/pages/<page>.js` via plain `<script>` tags. Everything is a global class or function; there are no ES modules.

**Adding a feature that touches data means editing three places**: an `ipcMain.handle` in `main.js`, a one-line bridge in `preload.js`, and the caller in `assets/js/pages/`. Forgetting the preload line is the usual failure.

### Database (`database/db.js`)

- `module.exports` is a **Proxy** that opens the connection lazily on first property access, so `db.prepare(...)` works while the file is still safe to `require` before `app.whenReady()`. Opening it early would create the SQLite file in a temp dir. `main.js` requires it inside `whenReady()` and calls `initializeDatabase()`.
- Schema is created idempotently (`CREATE TABLE IF NOT EXISTS`) on every boot; migrations are ad-hoc blocks at the top of `initializeDatabase()` (see the `receipt_number` drop). Seed data (admin/admin, one store, one supplier) is inserted only when `users` is empty.
- **Stock is never stored.** `view_current_stock` derives `current_quantity` as `SUM(In + Opening_Balance) - SUM(Out)` over `transaction_details`. Never add a quantity column to `items`.
- **Unit price is never stored on `items`** either — queries derive it with a correlated subquery for the most recent `'In'` transaction with `unit_price > 0`. `Out` rows are written with `unit_price = 0`.
- **Soft delete everywhere** (`is_deleted = 1`); every read filters on `is_deleted = 0`. Hard deletes would break the accounting ledger.
- Receipts are written inside a `db.transaction(...)` (header into `transactions`, lines into `transaction_details`) so a partial receipt can never land.

### Auth & session

`hashPassword`/`verifyPassword` in `main.js` use scrypt (`scrypt:<salt>:<hash>`). Legacy plaintext hashes still validate and are silently re-hashed on the next successful login. The renderer stores the session in `localStorage.userSession`; `checkSession()` in `common.js` guards each page, and there's a 10-minute idle auto-logout. Sensitive actions (backup, restore) go through `promptForPassword()`, which re-verifies via the `login` IPC.

### Backup & cloud sync (`gitManager.js` + `main.js`)

Backups are a git repo in `userData/CloudBackupRepo` driven by `isomorphic-git`. `generateSQLDump()` dumps the SQLite database to `database_dump.sql`, which is the only file committed; each backup is a commit, and restore = checkout that commit + rebuild + `app.relaunch()`. Cloud push targets a GitHub repo whose URL and PAT live in `userData/system_config.json` (written by `save-settings`). Auto-backup runs on a `backupFrequency`-day interval plus an hourly pending-push check.

Note the near-identical sync logic duplicated between the `sync-with-cloud` IPC handler and `performAutoBackup()` in `main.js` — fix both when touching either.

### Printing (`assets/js/components/printReport.js`)

`window.printReport` is the single global that all pages print through — it builds a standalone HTML document, opens a popup, and prints it. Per-type entry points: `printInventoryTable`, `printReceipt`, `printDashboardSummary`, `printMovementsTable`, `printSuppliersTable`, `printItemCard`. Column layouts and A4 landscape/portrait rules differ per type; do not hand-roll a new print path in a page script. Official documents carry signature blocks (`printSignatures.js`). `assets/css/print.css` holds the `@media print` rules.

`generate-report` (PDF) and `print-direct` in `main.js` print the *live page* via `webContents`, which is a separate, older path from `printReport`.

## Conventions

- Comments, UI strings, and toast/error messages are in Arabic. Console logs mix Arabic with emoji prefixes. Match the surrounding language when editing a file.
- Numbers are formatted with the `ar-LY` locale (dot = thousands, comma = decimal); `parseArabicNumber()` in `common.js` reverses this for table sorting.
- Dev DevTools open automatically when `!app.isPackaged`.
