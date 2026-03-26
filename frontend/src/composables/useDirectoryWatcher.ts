type ChangeHandler = (path: string) => void

const changeHandlers = new Set<ChangeHandler>()
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let stopped = false

function connect() {
    if (stopped) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${location.host}/ws/watch`)

    ws.addEventListener('open', () => {
        // Re-send all active watches after reconnect
        for (const path of watchedPaths.keys()) {
            ws!.send(JSON.stringify({command: 'watch', path}))
        }
    })

    ws.addEventListener('message', (evt) => {
        try {
            const msg = JSON.parse(evt.data)
            if (msg.event === 'changed' && typeof msg.path === 'string') {
                changeHandlers.forEach(h => h(msg.path))
            }
        } catch {
            // ignore malformed frames
        }
    })

    ws.addEventListener('close', () => {
        ws = null
        if (!stopped) {
            reconnectTimer = setTimeout(connect, 3000)
        }
    })

    ws.addEventListener('error', () => {
        ws?.close()
    })
}

connect()

/** Ref-counted paths: multiple panels can watch the same directory */
const watchedPaths = new Map<string, number>()

function sendCommand(command: string, path: string) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({command, path}))
    }
}

export function useDirectoryWatcher() {
    function watch(path: string): void {
        const count = watchedPaths.get(path) ?? 0
        watchedPaths.set(path, count + 1)
        if (count === 0) {
            sendCommand('watch', path)
        }
    }

    function unwatch(path: string): void {
        const count = watchedPaths.get(path) ?? 0
        if (count <= 1) {
            watchedPaths.delete(path)
            sendCommand('unwatch', path)
        } else {
            watchedPaths.set(path, count - 1)
        }
    }

    function onChange(handler: ChangeHandler): () => void {
        changeHandlers.add(handler)
        return () => changeHandlers.delete(handler)
    }

    return {watch, unwatch, onChange}
}
