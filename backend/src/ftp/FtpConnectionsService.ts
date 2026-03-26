import {randomUUID} from 'node:crypto'
import type {StorageProvider} from '../storage/StorageProvider.js'
import type {SavedFtpConnection} from '../protocol/ftp-connection-types.js'

const STORAGE_KEY = 'ftp-connections'

const VALID_PROTOCOLS = new Set(['ftp', 'ftps', 'sftp'])
const NAME_MAX_LENGTH = 100

export interface CreateConnectionInput {
    name?: string
    protocol: string
    host: string
    port: number
    username: string
    password?: string
    rejectUnauthorized?: boolean
    remotePath?: string
}

function validateInput(input: CreateConnectionInput): string | null {
    if (!input.host || typeof input.host !== 'string') return 'host is required'
    if (!input.username || typeof input.username !== 'string') return 'username is required'
    if (!VALID_PROTOCOLS.has(input.protocol)) return 'protocol must be ftp, ftps, or sftp'
    if (typeof input.port !== 'number' || input.port < 1 || input.port > 65535) return 'port must be 1-65535'
    if (input.name && input.name.length > NAME_MAX_LENGTH) return `name must be ${NAME_MAX_LENGTH} chars or less`
    return null
}

export class FtpConnectionsService {
    constructor(private storage: StorageProvider) {}

    async list(): Promise<SavedFtpConnection[]> {
        return await this.storage.load<SavedFtpConnection[]>(STORAGE_KEY) ?? []
    }

    async getById(id: string): Promise<SavedFtpConnection | undefined> {
        const all = await this.list()
        return all.find(c => c.id === id)
    }

    async create(input: CreateConnectionInput): Promise<SavedFtpConnection> {
        const error = validateInput(input)
        if (error) throw new Error(error)

        const conn: SavedFtpConnection = {
            id: randomUUID(),
            name: input.name?.trim() || `${input.username}@${input.host}:${input.port}`,
            protocol: input.protocol as SavedFtpConnection['protocol'],
            host: input.host.trim(),
            port: input.port,
            username: input.username.trim(),
            password: input.password,
            rejectUnauthorized: input.rejectUnauthorized,
            remotePath: input.remotePath?.trim() || '/',
        }
        const all = await this.list()
        all.push(conn)
        await this.storage.save(STORAGE_KEY, all)
        return conn
    }

    async update(id: string, input: CreateConnectionInput): Promise<SavedFtpConnection | null> {
        const error = validateInput(input)
        if (error) throw new Error(error)

        const all = await this.list()
        const index = all.findIndex(c => c.id === id)
        if (index === -1) return null

        all[index] = {
            ...all[index],
            name: input.name?.trim() || `${input.username}@${input.host}:${input.port}`,
            protocol: input.protocol as SavedFtpConnection['protocol'],
            host: input.host.trim(),
            port: input.port,
            username: input.username.trim(),
            password: input.password,
            rejectUnauthorized: input.rejectUnauthorized,
            remotePath: input.remotePath?.trim() || '/',
        }
        await this.storage.save(STORAGE_KEY, all)
        return all[index]
    }

    async delete(id: string): Promise<boolean> {
        const all = await this.list()
        const filtered = all.filter(c => c.id !== id)
        if (filtered.length === all.length) return false
        await this.storage.save(STORAGE_KEY, filtered)
        return true
    }
}
