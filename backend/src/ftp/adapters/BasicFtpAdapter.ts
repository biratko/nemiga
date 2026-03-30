import {Client, type FileInfo} from 'basic-ftp'
import {PassThrough, Transform, type Readable, type Writable} from 'node:stream'
import type {FSEntry} from '../../protocol/fs-types.js'
import type {FtpAdapter} from './FtpAdapter.js'
import path from 'node:path'

export class BasicFtpAdapter implements FtpAdapter {
    private client = new Client()

    async connect(host: string, port: number, username: string, password: string, options?: {secure?: boolean; rejectUnauthorized?: boolean}): Promise<void> {
        const secure = options?.secure ?? false
        const rejectUnauthorized = options?.rejectUnauthorized ?? true
        this.client.ftp.verbose = false
        await this.client.access({
            host, port, user: username, password, secure,
            secureOptions: secure ? {rejectUnauthorized} : undefined,
        })
    }

    async disconnect(): Promise<void> { this.client.close() }

    async list(remotePath: string): Promise<FSEntry[]> {
        const items = await this.client.list(remotePath)
        return items.map((item) => this.toFSEntry(item))
    }

    async mkdir(remotePath: string): Promise<void> {
        await this.client.ensureDir(remotePath)
        await this.client.cd('/')
    }

    async rename(oldPath: string, newPath: string): Promise<void> { await this.client.rename(oldPath, newPath) }
    async delete(remotePath: string): Promise<void> { await this.client.remove(remotePath) }
    async deleteDir(remotePath: string): Promise<void> { await this.client.removeDir(remotePath) }

    async createReadStream(remotePath: string): Promise<Readable> {
        // Use a PassThrough as the internal download sink for basic-ftp.
        // basic-ftp writes to the PassThrough; the returned Transform reads from it.
        //
        // The challenge: pipeline() resolves as soon as the last byte flows through
        // the PassThrough, but basic-ftp may still be exchanging the 226 Transfer
        // Complete response on the control channel. Any FTP command issued before
        // that response is received will fail with "task still running".
        //
        // Fix: wrap the PassThrough in a custom Transform whose final() callback
        // waits for the downloadFrom promise before signalling completion.
        const passThrough = new PassThrough()
        let downloadDoneResolve!: () => void
        let downloadDoneReject!: (err: Error) => void
        const downloadDonePromise = new Promise<void>((res, rej) => {
            downloadDoneResolve = res
            downloadDoneReject = rej
        })
        this.client.downloadTo(passThrough, remotePath)
            .then(() => downloadDoneResolve())
            .catch((err: Error) => {
                passThrough.destroy(err)
                downloadDoneReject(err)
            })
        const wrapper = new Transform({
            transform(chunk, _enc, cb) { cb(null, chunk) },
            flush(cb) {
                downloadDonePromise.then(() => cb(), cb)
            },
        })
        passThrough.on('error', (err) => wrapper.destroy(err))
        passThrough.pipe(wrapper)
        return wrapper
    }

    async createWriteStream(remotePath: string): Promise<Writable> {
        // Use a PassThrough as the data conduit for basic-ftp's uploadFrom.
        // basic-ftp reads from the PassThrough; callers write to it.
        //
        // The challenge: pipeline() resolves as soon as the last byte flows through
        // the PassThrough, but basic-ftp may still be exchanging the 226 Transfer
        // Complete response on the control channel. Any FTP command issued before
        // that response is received will fail with "task still running".
        //
        // Fix: wrap the PassThrough in a custom Writable whose final() callback
        // waits for the uploadFrom promise before signalling completion.
        const passThrough = new PassThrough()
        const {Writable} = await import('node:stream')
        let uploadDoneResolve!: () => void
        let uploadDoneReject!: (err: Error) => void
        const uploadDonePromise = new Promise<void>((res, rej) => {
            uploadDoneResolve = res
            uploadDoneReject = rej
        })
        this.client.uploadFrom(passThrough, remotePath)
            .then(() => uploadDoneResolve())
            .catch((err: Error) => {
                passThrough.destroy(err)
                uploadDoneReject(err)
            })
        const wrapper = new Writable({
            write(chunk, _enc, cb) {
                if (!passThrough.write(chunk)) {
                    passThrough.once('drain', cb)
                } else {
                    cb()
                }
            },
            final(cb) {
                passThrough.end()
                uploadDonePromise.then(() => cb(), cb)
            },
        })
        passThrough.on('error', (err) => wrapper.destroy(err))
        return wrapper
    }

    async downloadToFile(remotePath: string, localPath: string): Promise<void> {
        await this.client.downloadTo(localPath, remotePath)
    }

    async uploadFromFile(localPath: string, remotePath: string): Promise<void> {
        await this.client.uploadFrom(localPath, remotePath)
    }

    async pwd(): Promise<string> { return this.client.pwd() }
    isConnected(): boolean { return !this.client.closed }
    async sendNoop(): Promise<void> { await this.client.send('NOOP') }

    private toFSEntry(info: FileInfo): FSEntry {
        const ext = info.type !== 2 ? (path.extname(info.name).slice(1) || null) : null
        return {
            name: info.name,
            type: info.type === 2 ? 'directory' : info.isSymbolicLink ? 'symlink' : 'file',
            size: info.size,
            modified: info.modifiedAt ? info.modifiedAt.toISOString() : new Date(0).toISOString(),
            permissions: info.permissions?.toString() ?? '',
            extension: ext,
            hidden: info.name.startsWith('.'),
            symlink_target: null,
        }
    }
}
