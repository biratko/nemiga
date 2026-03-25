import type {Readable, Writable} from 'node:stream'
import type {FSEntry} from '../../protocol/fs-types.js'

export interface FtpAdapter {
    connect(host: string, port: number, username: string, password: string, options?: {secure?: boolean}): Promise<void>
    disconnect(): Promise<void>
    list(remotePath: string): Promise<FSEntry[]>
    mkdir(remotePath: string): Promise<void>
    rename(oldPath: string, newPath: string): Promise<void>
    delete(remotePath: string): Promise<void>
    deleteDir(remotePath: string): Promise<void>
    createReadStream(remotePath: string): Promise<Readable>
    createWriteStream(remotePath: string): Promise<Writable>
    /** Download remote file to a local path, awaiting the full FTP transfer. */
    downloadToFile(remotePath: string, localPath: string): Promise<void>
    /** Upload a local file to a remote path, awaiting the full FTP transfer. */
    uploadFromFile(localPath: string, remotePath: string): Promise<void>
    pwd(): Promise<string>
    isConnected(): boolean
    sendNoop(): Promise<void>
}
