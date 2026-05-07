import {ref} from 'vue'

interface SessionInfo {
    username: string
    host: string
}

const sessions = ref<Map<string, SessionInfo>>(new Map())

function replace(map: Map<string, SessionInfo>): void {
    sessions.value = new Map(map)
}

export function useRemoteSessionInfo() {
    function register(sessionId: string, info: SessionInfo): void {
        const next = new Map(sessions.value)
        next.set(sessionId, info)
        replace(next)
    }

    function unregister(sessionId: string): void {
        if (!sessions.value.has(sessionId)) return
        const next = new Map(sessions.value)
        next.delete(sessionId)
        replace(next)
    }

    function rename(oldSessionId: string, newSessionId: string): void {
        const info = sessions.value.get(oldSessionId)
        if (!info) return
        const next = new Map(sessions.value)
        next.delete(oldSessionId)
        next.set(newSessionId, info)
        replace(next)
    }

    function lookup(sessionId: string): SessionInfo | undefined {
        return sessions.value.get(sessionId)
    }

    function displayHost(sessionId: string, fallbackHost: string): string {
        const info = sessions.value.get(sessionId)
        return info ? `${info.username}@${info.host}` : fallbackHost
    }

    return {register, unregister, rename, lookup, displayHost, sessions}
}
