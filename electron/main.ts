import path from 'node:path'
import {app, BrowserWindow, Menu} from 'electron'
import type {AddressInfo} from 'node:net'
import {createApp} from '../backend/src/createApp.js'

let mainWindow: BrowserWindow | null = null

// In packaged app, frontend/dist is in resources/frontend/dist
// In dev, it's at ../frontend/dist relative to electron/
const frontendDist = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'dist')
    : path.resolve(__dirname, '..', '..', 'frontend', 'dist')

Menu.setApplicationMenu(null)

const {server, cleanup} = createApp({frontendDist})

async function createWindow() {
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve)
    })
    const {port} = server.address() as AddressInfo
    console.log(`Backend listening on http://127.0.0.1:${port}`)

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Nemiga',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    mainWindow.loadURL(`http://127.0.0.1:${port}`)

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', async () => {
    await cleanup()
    app.quit()
})

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow()
    }
})
