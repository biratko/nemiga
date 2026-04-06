import {Readable, Writable, PassThrough} from 'node:stream'
import type {FSEntry} from '../protocol/fs-types.js'
import type {FtpAdapter} from '../ftp/adapters/FtpAdapter.js'
import path from 'node:path'

let Client: any
try {
    Client = (await import('ssh2')).Client
} catch {
    // ssh2 unavailable
}

/**
 * SSH adapter — executes shell commands over SSH for file operations.
 * Does not require sftp-server on the remote host.
 */
export class SshAdapter implements FtpAdapter {
    private conn: any = null
    private connected = false

    async connect(host: string, port: number, username: string, password: string): Promise<void> {
        if (!Client) throw new Error('SSH is not available in this environment (ssh2 module not found)')
        this.conn = new Client()
        await new Promise<void>((resolve, reject) => {
            this.conn.on('ready', () => resolve())
            this.conn.on('error', (err: Error) => reject(err))
            this.conn.connect({host, port, username, password, readyTimeout: 10000})
        })
        this.connected = true
    }

    async disconnect(): Promise<void> {
        this.connected = false
        this.conn?.end()
    }

    private exec(cmd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.conn.exec(cmd, (err: Error | undefined, stream: any) => {
                if (err) return reject(err)
                let stdout = ''
                let stderr = ''
                stream.on('data', (d: Buffer) => { stdout += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
                stream.on('close', (code: number) => {
                    if (code !== 0) reject(new Error(stderr.trim() || `Command failed with code ${code}`))
                    else resolve(stdout)
                })
            })
        })
    }

    async list(remotePath: string): Promise<FSEntry[]> {
        const escaped = this.shellEscape(remotePath)
        const output = await this.exec(
            `LC_ALL=C stat --format='%F\t%A\t%s\t%Y\t%n' ${escaped}/* ${escaped}/.* 2>/dev/null || true`
        )
        if (!output.trim()) return []

        const entries: FSEntry[] = []
        const symlinkPaths: string[] = []

        for (const line of output.split('\n')) {
            if (!line.trim()) continue
            const parts = line.split('\t')
            if (parts.length < 5) continue

            const [typeStr, perms, sizeStr, mtimeStr, fullPath] = parts
            const name = path.basename(fullPath)
            if (name === '.' || name === '..') continue

            const isDir = typeStr === 'directory'
            const isSymlink = typeStr === 'symbolic link'
            const ext = !isDir ? (path.extname(name).slice(1) || null) : null

            if (isSymlink) symlinkPaths.push(fullPath)

            entries.push({
                name,
                type: isDir ? 'directory' : isSymlink ? 'symlink' : 'file',
                size: parseInt(sizeStr, 10) || 0,
                modified: new Date(parseInt(mtimeStr, 10) * 1000).toISOString(),
                permissions: perms,
                extension: ext,
                hidden: name.startsWith('.'),
                symlink_target: null,
                symlink_target_type: null,
            })
        }

        // Resolve symlink target types in one round-trip
        if (symlinkPaths.length > 0) {
            const escapedPaths = symlinkPaths.map(p => this.shellEscape(p)).join(' ')
            const resolveOutput = await this.exec(
                `LC_ALL=C stat -L --format='%F\t%n' ${escapedPaths} 2>/dev/null || true`
            )
            const targetTypes = new Map<string, 'file' | 'directory'>()
            for (const line of resolveOutput.split('\n')) {
                if (!line.trim()) continue
                const parts = line.split('\t')
                if (parts.length < 2) continue
                const [typeStr, fullPath] = parts
                const name = path.basename(fullPath)
                targetTypes.set(name, typeStr === 'directory' ? 'directory' : 'file')
            }
            for (const entry of entries) {
                if (entry.type === 'symlink' && targetTypes.has(entry.name)) {
                    entry.symlink_target_type = targetTypes.get(entry.name)!
                }
            }
        }

        return entries
    }

    async mkdir(remotePath: string): Promise<void> {
        await this.exec(`mkdir -p ${this.shellEscape(remotePath)}`)
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        await this.exec(`mv ${this.shellEscape(oldPath)} ${this.shellEscape(newPath)}`)
    }

    async delete(remotePath: string): Promise<void> {
        await this.exec(`rm -f ${this.shellEscape(remotePath)}`)
    }

    async deleteDir(remotePath: string): Promise<void> {
        await this.exec(`rm -rf ${this.shellEscape(remotePath)}`)
    }

    async createReadStream(remotePath: string): Promise<Readable> {
        const passthrough = new PassThrough()
        this.conn.exec(`cat ${this.shellEscape(remotePath)}`, (err: Error | undefined, stream: any) => {
            if (err) { passthrough.destroy(err); return }
            stream.pipe(passthrough)
            let stderr = ''
            stream.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
            stream.on('close', (code: number) => {
                if (code !== 0) passthrough.destroy(new Error(stderr.trim() || `Read failed with code ${code}`))
            })
        })
        return passthrough
    }

    async createWriteStream(remotePath: string): Promise<Writable> {
        const passthrough = new PassThrough()
        this.conn.exec(`cat > ${this.shellEscape(remotePath)}`, (err: Error | undefined, stream: any) => {
            if (err) { passthrough.destroy(err); return }
            passthrough.pipe(stream)
            let stderr = ''
            stream.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
            stream.on('close', (code: number) => {
                if (code !== 0) {
                    passthrough.destroy(new Error(stderr.trim() || `Write failed with code ${code}`))
                }
            })
        })
        return passthrough
    }

    async downloadToFile(remotePath: string, localPath: string): Promise<void> {
        const {createWriteStream} = await import('node:fs')
        const readStream = await this.createReadStream(remotePath)
        const ws = createWriteStream(localPath)
        await new Promise<void>((resolve, reject) => {
            readStream.pipe(ws)
            ws.on('finish', resolve)
            ws.on('error', reject)
            readStream.on('error', reject)
        })
    }

    async uploadFromFile(localPath: string, remotePath: string): Promise<void> {
        const {createReadStream} = await import('node:fs')
        const writeStream = await this.createWriteStream(remotePath)
        const rs = createReadStream(localPath)
        await new Promise<void>((resolve, reject) => {
            rs.pipe(writeStream)
            writeStream.on('finish', resolve)
            writeStream.on('error', reject)
            rs.on('error', reject)
        })
    }

    async pwd(): Promise<string> {
        const out = await this.exec('pwd')
        return out.trim()
    }

    isConnected(): boolean { return this.connected }

    async sendNoop(): Promise<void> {
        await this.exec('true')
    }

    private shellEscape(s: string): string {
        return "'" + s.replace(/'/g, "'\\''") + "'"
    }
}
