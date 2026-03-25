import {Transform} from 'node:stream'
import unbzip2 from 'unbzip2-stream'
import compressjs from 'compressjs'

/** Streaming bzip2 decompression (handles large files) */
export function createBunzip2(): Transform {
    return unbzip2()
}

/** Bzip2 compression (buffers entire input — used rarely for tar.bz2 creation) */
export function createBzip2(): Transform {
    const chunks: Buffer[] = []
    return new Transform({
        transform(chunk, _encoding, callback) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            callback()
        },
        flush(callback) {
            try {
                const input = new Uint8Array(Buffer.concat(chunks))
                const compressed = compressjs.Bzip2.compressFile(input)
                this.push(Buffer.from(compressed))
                callback()
            } catch (err) {
                callback(err as Error)
            }
        },
    })
}
