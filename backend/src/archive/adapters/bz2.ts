import {spawn} from 'node:child_process'
import {Duplex} from 'node:stream'

export function createBzip2(): Duplex {
    const proc = spawn('bzip2', ['-z'], {stdio: ['pipe', 'pipe', 'ignore']})

    const duplex = new Duplex({
        write(chunk, _encoding, callback) {
            if (!proc.stdin.write(chunk)) {
                proc.stdin.once('drain', callback)
            } else {
                callback()
            }
        },
        read() {},
        final(callback) {
            proc.stdin.end(callback)
        },
    })

    proc.stdout.on('data', (chunk) => {
        if (!duplex.push(chunk)) {
            proc.stdout.pause()
        }
    })
    duplex.on('resume', () => proc.stdout.resume())
    proc.stdout.on('end', () => duplex.push(null))
    proc.on('error', (err) => duplex.destroy(err))

    return duplex
}

export function createBunzip2(): Duplex {
    const proc = spawn('bzip2', ['-d'], {stdio: ['pipe', 'pipe', 'ignore']})

    const duplex = new Duplex({
        write(chunk, _encoding, callback) {
            if (!proc.stdin.write(chunk)) {
                proc.stdin.once('drain', callback)
            } else {
                callback()
            }
        },
        read() {},
        final(callback) {
            proc.stdin.end(callback)
        },
    })

    proc.stdout.on('data', (chunk) => {
        if (!duplex.push(chunk)) {
            proc.stdout.pause()
        }
    })
    duplex.on('resume', () => proc.stdout.resume())
    proc.stdout.on('end', () => duplex.push(null))
    proc.on('error', (err) => duplex.destroy(err))

    return duplex
}
