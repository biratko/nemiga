import SftpClient from 'ssh2-sftp-client'
import type {Readable, Writable} from 'node:stream'
import {PassThrough} from 'node:stream'
import type {FSEntry} from '../../protocol/fs-types.js'
import type {FtpAdapter} from './FtpAdapter.js'
import path from 'node:path'

export class SftpAdapter implements FtpAdapter {
    private client = new SftpClient()
    private connected = false

    async connect(host: string, port: number, username: string, password: string): Promise<void> {
        await this.client.connect({ host, port, username, password, readyTimeout: 10000 })
        this.connected = true
    }

    async disconnect(): Promise<void> { this.connected = false; await this.client.end() }

    async list(remotePath: string): Promise<FSEntry[]> {
        const items = await this.client.list(remotePath)
        return items.map((item) => this.toFSEntry(item))
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

    async pwd(): Promise<string> { return this.client.cwd() }
    isConnected(): boolean { return this.connected }
    async sendNoop(): Promise<void> { await this.client.stat('/') }

    private toFSEntry(item: SftpClient.FileInfo): FSEntry {
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
        }
    }
}
