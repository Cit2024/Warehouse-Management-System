/**
 * Report preview capture script for the README.
 *
 * Renders each printable report in a hidden A4-sized Electron window and saves
 * the viewport as a PNG. Reuses the real PrintReport component and the same
 * sample data used by scripts/capture-screenshots.js.
 *
 * Usage: xvfb-run -a node_modules/.bin/electron scripts/capture-report-previews.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

// Under xvfb the GPU process can die and capturePage() then misses composited
// layers. Software rendering is reliable for offscreen captures.
app.disableHardwareAcceleration();

const ROOT = path.resolve(__dirname, '..');
const PRELOAD = path.join(__dirname, 'report-capture-preload.js');
const BRIDGE = path.join(__dirname, 'report-capture-bridge.html');
const OUTDIR = path.join(ROOT, 'placeholders', 'reports');
const TEMP_HTML = path.join(__dirname, '.report-temp.html');

const A4_WIDTH = 794;   // 96 DPI portrait width
const A4_HEIGHT = 1123; // 96 DPI portrait height

async function captureHtmlToPng(htmlContent, filename, isLandscape) {
    const width = isLandscape ? A4_HEIGHT : A4_WIDTH;
    const height = isLandscape ? A4_WIDTH : A4_HEIGHT;

    fs.writeFileSync(TEMP_HTML, htmlContent, 'utf8');

    const win = new BrowserWindow({
        width,
        height,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    await win.loadFile(TEMP_HTML);
    await new Promise(resolve => setTimeout(resolve, 600));

    // Force a layout flush so every layer is painted before capture.
    await win.webContents.executeJavaScript('document.body.getBoundingClientRect().width');

    const image = await win.webContents.capturePage();
    const outPath = path.join(OUTDIR, filename);
    fs.writeFileSync(outPath, image.toPNG());
    console.log(`Captured: ${outPath}`);

    win.close();
}

async function main() {
    if (!fs.existsSync(OUTDIR)) {
        fs.mkdirSync(OUTDIR, { recursive: true });
    }

    // Isolated userData so we do not touch the real DB.
    app.setPath('userData', path.join(ROOT, '.screenshot-data'));

    const bridge = new BrowserWindow({
        width: 400,
        height: 200,
        show: false,
        webPreferences: {
            preload: PRELOAD,
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    bridge.webContents.on('console-message', (_event, level, message) => {
        console.log(`[bridge:${level}] ${message}`);
    });

    ipcMain.handle('render-and-capture-report', async (_event, { html, filename, landscape }) => {
        try {
            await captureHtmlToPng(html, filename, landscape);
            return { success: true };
        } catch (error) {
            console.error(`Failed to capture ${filename}:`, error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('report-capture-done', () => {
        try {
            if (fs.existsSync(TEMP_HTML)) {
                fs.unlinkSync(TEMP_HTML);
            }
        } catch (e) {
            // ignore cleanup errors
        }
        app.quit();
    });

    try {
        await bridge.loadFile(BRIDGE);
        console.log('Bridge loaded.');
    } catch (loadError) {
        console.error('Bridge load failed:', loadError.message);
        app.quit();
    }
}

app.whenReady().then(main);

app.on('window-all-closed', () => {
    app.quit();
});
