import {Client, type FileInfo} from 'basic-ftp'
import {PassThrough, type Readable, type Writable} from 'node:stream'
import type {FSEntry} from '../../protocol/fs-types.js'
import type {FtpAdapter} from './FtpAdapter.js'
import path from 'node:path'

export class BasicFtpAdapter implements FtpAdapter {
    private client = new Client()

    async connect(host: string, port: number, username: string, password: string, options?: {secure?: boolean}): Promise<void> {
        const secure = options?.secure ?? false
        this.client.ftp.verbose = false
        await this.client.access({
            host, port, user: username, password, secure,
            secureOptions: secure ? {rejectUnauthorized: false} : undefined,
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
        const passThrough = new PassThrough()
        this.client.downloadTo(passThrough, remotePath).catch((err) => { passThrough.destroy(err) })
        return passThrough
    }

    async createWriteStream(remotePath: string): Promise<Writable> {
        const passThrough = new PassThrough()
        this.client.uploadFrom(passThrough, remotePath).catch((err) => { passThrough.destroy(err) })
        return passThrough
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
