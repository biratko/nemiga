import net from 'node:net'
import path from 'node:path'
import {createApp} from './createApp.js'

const port = parseInt(process.env.PORT || '8080', 10)
const host = process.env.HOST || '127.0.0.1'

const allowedRoots = process.env.ALLOWED_ROOTS
    ? process.env.ALLOWED_ROOTS.split(path.delimiter).filter(Boolean)
    : undefined

const {server, cleanup} = createApp({allowedRoots})

server.listen(port, host, () => {
    console.log(`Nemiga listening on http://${host}:${port}`)

    if (!net.isIP(host) || !isLoopback(host)) {
        console.warn('⚠  WARNING: server is bound to a non-loopback address — the entire filesystem is accessible over the network')
        if (!allowedRoots) {
            console.warn('⚠  Consider setting ALLOWED_ROOTS to restrict accessible paths (colon-separated list)')
        }
    }

    if (allowedRoots) {
        console.log(`Path guard active, allowed roots: ${allowedRoots.join(', ')}`)
    }
})

function isLoopback(addr: string): boolean {
    return addr === '127.0.0.1' || addr === '::1' || addr === 'localhost'
}

function shutdown() {
    console.log('\nShutting down...')
    cleanup().finally(() => process.exit(0))
    setTimeout(() => {
        console.error('Forced shutdown after timeout')
        process.exit(1)
    }, 5000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGHUP', shutdown)
