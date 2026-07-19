/**
 * Preload used only by scripts/capture-report-previews.js.
 * Exposes a small IPC bridge so the renderer bridge can ask the main process
 * to render a printable HTML document in a hidden A4 window and save it as a PNG.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronCapture', {
    /**
     * Send HTML to the main process, wait while it renders and captures it,
     * then resolve when the PNG has been saved.
     */
    renderAndCapture: (payload) => ipcRenderer.invoke('render-and-capture-report', payload),

    /**
     * Tell the main process that all reports have been captured.
     */
    done: () => ipcRenderer.send('report-capture-done')
});
