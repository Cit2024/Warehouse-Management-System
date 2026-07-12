/**
 * Contract test for the IPC bridge.
 *
 * Adding a feature that touches data means editing three places: an
 * ipcMain.handle in main.js, a bridge line in preload.js, and the caller in
 * assets/js/pages/. Forgetting the preload line fails silently at runtime
 * (window.api.x is undefined) — this test turns that into a build failure.
 *
 * Runs under plain node: no DOM, no database.
 */

const fs = require('fs');
const path = require('path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

function channelsFrom(source, pattern) {
    return new Set(Array.from(source.matchAll(pattern), (m) => m[1]));
}

const handled = channelsFrom(mainSource, /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g);
const invoked = channelsFrom(preloadSource, /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g);

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log('  ✓', message); }
    else { failed++; console.error('  ✗', message); }
}

console.log('\nIPC Bridge Contract Test');
console.log('========================\n');

assert(handled.size > 0, `main.js registers handlers (found ${handled.size})`);
assert(invoked.size > 0, `preload.js bridges channels (found ${invoked.size})`);

const unbridged = [...handled].filter((c) => !invoked.has(c));
const orphaned = [...invoked].filter((c) => !handled.has(c));

assert(
    unbridged.length === 0,
    unbridged.length === 0
        ? 'every ipcMain.handle channel is exposed in preload.js'
        : `handlers with no preload bridge (unreachable from the renderer): ${unbridged.join(', ')}`
);

assert(
    orphaned.length === 0,
    orphaned.length === 0
        ? 'every preload channel has a handler in main.js'
        : `preload channels with no handler (would hang the renderer): ${orphaned.join(', ')}`
);

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
