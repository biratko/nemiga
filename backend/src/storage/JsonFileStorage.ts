import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import envPaths from 'env-paths'
import type {StorageProvider} from './StorageProvider.js'

const configDir = envPaths('tacom', {suffix: ''}).config
const VALID_KEY = /^[a-z0-9_-]+$/

export class JsonFileStorage implements StorageProvider {
    async load<T>(key: string): Promise<T | null> {
        if (!VALID_KEY.test(key)) throw new Error(`Invalid storage key: ${key}`)
        let data: string
        try {
            data = await readFile(join(configDir, `${key}.json`), 'utf-8')
        } catch (err: any) {
            if (err.code === 'ENOENT') return null
            throw err
        }
        return JSON.parse(data) as T
    }

    async save<T>(key: string, data: T): Promise<void> {
        if (!VALID_KEY.test(key)) throw new Error(`Invalid storage key: ${key}`)
        await mkdir(configDir, {recursive: true})
        await writeFile(join(configDir, `${key}.json`), JSON.stringify(data, null, 2), 'utf-8')
    }
}
