import {readFile, writeFile, mkdir, rename} from 'node:fs/promises'
import {join} from 'node:path'
import envPaths from 'env-paths'
import type {StorageProvider} from './StorageProvider.js'

const VALID_KEY = /^[a-z0-9_-]+$/

export interface JsonFileStorageOptions {
    configDir?: string
}

export class JsonFileStorage implements StorageProvider {
    private readonly configDir: string

    constructor(options: JsonFileStorageOptions = {}) {
        this.configDir = options.configDir ?? envPaths('nemiga', {suffix: ''}).config
    }

    async load<T>(key: string): Promise<T | null> {
        if (!VALID_KEY.test(key)) throw new Error(`Invalid storage key: ${key}`)
        let data: string
        try {
            data = await readFile(join(this.configDir, `${key}.json`), 'utf-8')
        } catch (err: any) {
            if (err.code === 'ENOENT') return null
            throw err
        }
        try {
            return JSON.parse(data) as T
        } catch {
            return null
        }
    }

    async save<T>(key: string, data: T): Promise<void> {
        if (!VALID_KEY.test(key)) throw new Error(`Invalid storage key: ${key}`)
        await mkdir(this.configDir, {recursive: true})
        const target = join(this.configDir, `${key}.json`)
        const tmp = `${target}.tmp`
        await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
        await rename(tmp, target)
    }
}
