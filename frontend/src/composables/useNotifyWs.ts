type Handler = (data: unknown) => void

const handlers = new Map<string, Set<Handler>>()
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let stopped = false

function connect() {
    if (stopped) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${location.host}/ws/notify`)

    ws.addEventListener('message', (evt) => {
        try {
            const {event, data} = JSON.parse(evt.data)
            const set = handlers.get(event)
            if (set) set.forEach(h => h(data))
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

export function useNotifyWs() {
    function on(event: string, handler: Handler): () => void {
        if (!handlers.has(event)) handlers.set(event, new Set())
        handlers.get(event)!.add(handler)
        return () => handlers.get(event)?.delete(handler)
    }

    return {on}
}
