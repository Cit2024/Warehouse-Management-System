/**
 * Screenshot capture script for the README.
 * Usage: xvfb-run -a node_modules/.bin/electron scripts/capture-screenshots.js
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

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
    { file: 'users.html', out: 'users.png' }
];

async function capture(pageFile, outFile) {
    const isDashboard = pageFile === 'dashboard.html';
    const win = new BrowserWindow({
        width: 1280,
        height: isDashboard ? 1600 : 800,
        show: false,
        webPreferences: {
            preload: PRELOAD,
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    await win.loadFile(path.join(ROOT, pageFile));

    // Wait for fonts, CSS animations, and data rendering.
    await new Promise(resolve => setTimeout(resolve, 2500));

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
            await capture(page.file, page.out);
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
