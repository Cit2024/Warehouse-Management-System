/**
 * Screenshot capture script for the README.
 * Usage: xvfb-run -a node_modules/.bin/electron scripts/capture-screenshots.js
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

// Under xvfb the GPU process can die and capturePage() then misses composited
// layers (the fixed-position sidebar renders blank). Software rendering is
// reliable for offscreen captures.
app.disableHardwareAcceleration();

const ROOT = path.resolve(__dirname, '..');
const PRELOAD = path.join(__dirname, 'screenshot-preload.js');
const OUTDIR = path.join(ROOT, 'placeholders');

const PAGES = [
    { file: 'index.html', out: 'login.png' },
    { file: 'dashboard.html', out: 'dashboard.png' },
    { file: 'items.html', out: 'items.png' },
    { file: 'suppliers.html', out: 'suppliers.png' },
    { file: 'entities.html', out: 'entities.png' },
    { file: 'supply.html', out: 'supply.png' },
    { file: 'dispense.html', out: 'dispense.png' },
    { file: 'report.html', out: 'report.png' },
    { file: 'settings.html', out: 'settings.png' },
    { file: 'users.html', out: 'users.png' },
    // Same dashboard captured as Store_Keeper: the sidebar loses backup/restore,
    // user management, and password change — used in the README roles section.
    { file: 'dashboard.html', out: 'dashboard-storekeeper.png', role: 'Store_Keeper' }
];

async function capture(pageFile, outFile, role) {
    const isDashboard = pageFile === 'dashboard.html';
    const win = new BrowserWindow({
        width: 1280,
        height: isDashboard ? 1600 : 800,
        show: false,
        webPreferences: {
            preload: PRELOAD,
            nodeIntegration: false,
            contextIsolation: true,
            additionalArguments: role ? [`--screenshot-role=${role}`] : []
        }
    });

    await win.loadFile(path.join(ROOT, pageFile));

    // Snap entrance animations to their final state so the capture never
    // freezes mid-fade (e.g. the sidebar at opacity 0).
    await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');

    // Hidden windows stop producing frames, so capturePage() can return a
    // stale early paint. Show the window (headless under xvfb anyway) so it
    // keeps repainting while data renders.
    win.show();

    // Wait for fonts and data rendering.
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Force one final repaint of the finished page before capturing.
    win.webContents.invalidate();
    await new Promise(resolve => setTimeout(resolve, 300));

    const image = await win.webContents.capturePage();
    const outPath = path.join(OUTDIR, outFile);
    fs.writeFileSync(outPath, image.toPNG());
    console.log(`Captured: ${outPath}`);

    win.close();
}

async function main() {
    if (!fs.existsSync(OUTDIR)) {
        fs.mkdirSync(OUTDIR, { recursive: true });
    }

    // Use an isolated userData directory so we do not touch the real DB.
    app.setPath('userData', path.join(ROOT, '.screenshot-data'));

    for (const page of PAGES) {
        try {
            await capture(page.file, page.out, page.role);
        } catch (error) {
            console.error(`Failed to capture ${page.file}:`, error.message);
        }
    }

    app.quit();
}

app.whenReady().then(main);

app.on('window-all-closed', () => {
    app.quit();
});
