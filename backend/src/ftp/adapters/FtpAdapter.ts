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
    pwd(): Promise<string>
    isConnected(): boolean
    sendNoop(): Promise<void>
}
