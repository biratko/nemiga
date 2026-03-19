import type {CopyEvents, MoveEvents, DeleteEvents, MkdirEvents, ExtractEvents, PackEvents} from '@/types/ws'

type EventMap = Record<string, {event: string}>
type EventHandler = (data: never) => void

export interface OperationWsHandle<T extends EventMap = EventMap> {
    onEvent<K extends string & keyof T>(name: K, handler: (data: T[K]) => void): () => void
    send(command: object): void
    close(): void
}

function connectOperationWs<T extends EventMap>(path: string): OperationWsHandle<T> {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}${path}`)
    const handlers = new Map<string, Set<EventHandler>>()
    let closedByClient = false

    ws.addEventListener('message', (e) => {
        try {
            const msg = JSON.parse(e.data as string)
            handlers.get(msg.event)?.forEach((h) => h(msg as never))
        } catch {
            // ignore malformed messages
        }
    })

    ws.addEventListener('close', () => {
        if (closedByClient) return
        const synthetic = {event: 'error', error: {code: 'WS_DISCONNECTED', message: 'Connection lost'}}
        handlers.get('error')?.forEach((h) => h(synthetic as never))
    })

    return {
        onEvent<K extends string & keyof T>(name: K, handler: (data: T[K]) => void): () => void {
            if (!handlers.has(name)) handlers.set(name, new Set())
            handlers.get(name)!.add(handler as EventHandler)
            return () => handlers.get(name)?.delete(handler as EventHandler)
        },

        send(command: object): void {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(command))
            } else {
                ws.addEventListener('open', () => ws.send(JSON.stringify(command)), {once: true})
            }
        },

        close(): void {
            closedByClient = true
            ws.close()
        },
    }
}

export function connectCopyWs(): OperationWsHandle<CopyEvents> {
    return connectOperationWs<CopyEvents>('/ws/operations/copy')
}

export function connectMoveWs(): OperationWsHandle<MoveEvents> {
    return connectOperationWs<MoveEvents>('/ws/operations/move')
}

export function connectDeleteWs(): OperationWsHandle<DeleteEvents> {
    return connectOperationWs<DeleteEvents>('/ws/operations/delete')
}

export function connectMkdirWs(): OperationWsHandle<MkdirEvents> {
    return connectOperationWs<MkdirEvents>('/ws/operations/mkdir')
}

export function connectExtractWs(): OperationWsHandle<ExtractEvents> {
    return connectOperationWs<ExtractEvents>('/ws/operations/extract')
}

export function connectPackWs(): OperationWsHandle<PackEvents> {
    return connectOperationWs<PackEvents>('/ws/operations/pack')
}
