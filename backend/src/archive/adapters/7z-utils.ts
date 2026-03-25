import {spawn} from 'node:child_process'
import path from 'node:path'
import {existsSync} from 'node:fs'

function find7zBinary(): string {
    if (process.platform !== 'win32') return '7z'

    const candidates = [
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', '7-Zip', '7z.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', '7-Zip', '7z.exe'),
    ]
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate
    }
    return '7z'
}

const SEVEN_ZIP = find7zBinary()

export function run7z(args: string[], cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(SEVEN_ZIP, args, {stdio: ['ignore', 'pipe', 'pipe'], cwd})
        const stderr: Buffer[] = []
        proc.stderr.on('data', (d) => stderr.push(d))
        proc.on('error', reject)
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`7z exited with code ${code}: ${Buffer.concat(stderr).toString()}`))
            } else {
                resolve()
            }
        })
    })
}

export function run7zCapture(args: string[]): Promise<{stdout: string; stderr: string}> {
    return new Promise((resolve, reject) => {
        const proc = spawn(SEVEN_ZIP, args, {stdio: ['ignore', 'pipe', 'pipe']})
        const stdout: Buffer[] = []
        const stderr: Buffer[] = []
        proc.stdout.on('data', (d) => stdout.push(d))
        proc.stderr.on('data', (d) => stderr.push(d))
        proc.on('error', reject)
        proc.on('close', (code) => {
            const out = Buffer.concat(stdout).toString()
            const err = Buffer.concat(stderr).toString()
            if (code !== 0) {
                reject(new Error(`7z exited with code ${code}: ${err || out}`))
            } else {
                resolve({stdout: out, stderr: err})
            }
        })
    })
}
