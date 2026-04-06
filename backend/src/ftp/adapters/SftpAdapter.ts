import type {Readable, Writable} from 'node:stream'
import type {FSEntry} from '../../protocol/fs-types.js'
import type {FtpAdapter} from './FtpAdapter.js'
import path from 'node:path'

// ssh2 has native bindings that may not be available in all environments (e.g. snap)
// Use dynamic import so the app starts even without it — error surfaces only when SFTP is used
let SftpClient: any
try {
    SftpClient = (await import('ssh2-sftp-client')).default
} catch {
    // ssh2 unavailable
}

export class SftpAdapter implements FtpAdapter {
    private client: any = null
    private connected = false

    async connect(host: string, port: number, username: string, password: string): Promise<void> {
        if (!SftpClient) throw new Error('SFTP is not available in this environment (ssh2 module not found)')
        this.client = new SftpClient()
        await this.client.connect({ host, port, username, password, readyTimeout: 10000 })
        this.connected = true
    }

    async disconnect(): Promise<void> { this.connected = false; await this.client.end() }

    async list(remotePath: string): Promise<FSEntry[]> {
        const items = await this.client.list(remotePath)
        const entries: FSEntry[] = []
        for (const item of items) {
            const entry = this.toFSEntry(item)
            if (entry.type === 'symlink') {
                try {
                    const targetStat = await this.client.stat(remotePath + '/' + item.name)
                    entry.symlink_target_type = targetStat.isDirectory ? 'directory' : 'file'
                } catch {
                    // broken symlink — leave as null
                }
            }
            entries.push(entry)
        }
        return entries
    }

    async mkdir(remotePath: string): Promise<void> { await this.client.mkdir(remotePath, true) }
    async rename(oldPath: string, newPath: string): Promise<void> { await this.client.rename(oldPath, newPath) }
    async delete(remotePath: string): Promise<void> { await this.client.delete(remotePath) }
    async deleteDir(remotePath: string): Promise<void> { await this.client.rmdir(remotePath, true) }

    async createReadStream(remotePath: string): Promise<Readable> {
        const stream = this.client.createReadStream(remotePath) as unknown as Readable
        return stream
    }

    async createWriteStream(remotePath: string): Promise<Writable> {
        const stream = this.client.createWriteStream(remotePath) as unknown as Writable
        return stream
    }

    async downloadToFile(remotePath: string, localPath: string): Promise<void> {
        await this.client.fastGet(remotePath, localPath)
    }

    async uploadFromFile(localPath: string, remotePath: string): Promise<void> {
        await this.client.fastPut(localPath, remotePath)
    }

    async pwd(): Promise<string> { return this.client.cwd() }
    isConnected(): boolean { return this.connected }
    async sendNoop(): Promise<void> { await this.client.stat('/') }

    private toFSEntry(item: any): FSEntry {
        const isDir = item.type === 'd'
        const isSymlink = item.type === 'l'
        const ext = !isDir ? (path.extname(item.name).slice(1) || null) : null
        return {
            name: item.name,
            type: isDir ? 'directory' : isSymlink ? 'symlink' : 'file',
            size: item.size,
            modified: new Date(item.modifyTime).toISOString(),
            permissions: item.rights ? `${item.rights.user}${item.rights.group}${item.rights.other}` : '',
            extension: ext,
            hidden: item.name.startsWith('.'),
            symlink_target: null,
            symlink_target_type: null,
        }
    }
}
