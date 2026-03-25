import FtpSrv from 'ftp-srv'
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

export interface FtpTestServer {
  port: number
  host: string
  rootDir: string
  url: string
  stop: () => Promise<void>
}

export async function startFtpServer(): Promise<FtpTestServer> {
  const rootDir = await mkdtemp(join(tmpdir(), 'tacom-ftp-test-'))
  const host = '127.0.0.1'

  const server = new FtpSrv({
    url: `ftp://${host}:0`,
    pasv_url: host,
    anonymous: false,
  })

  server.on('login', ({ username, password }, resolve, reject) => {
    if (username === 'test' && password === 'test') {
      resolve({ root: rootDir })
    } else {
      reject(new Error('Invalid credentials'))
    }
  })

  await server.listen()

  // ftp-srv exposes the actual port after listen
  const address = (server as unknown as { server: { address: () => unknown } }).server.address()
  const port = typeof address === 'object' && address !== null ? (address as { port: number }).port : 0

  return {
    port,
    host,
    rootDir,
    url: `ftp://${host}:${port}`,
    stop: async () => {
      server.close()
      await rm(rootDir, { recursive: true, force: true })
    },
  }
}

export async function startFtpsServer(): Promise<FtpTestServer> {
  const rootDir = await mkdtemp(join(tmpdir(), 'tacom-ftps-test-'))
  const host = '127.0.0.1'

  const { execSync } = await import('child_process')
  const keyPath = join(rootDir, 'key.pem')
  const certPath = join(rootDir, 'cert.pem')
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj "/CN=localhost"`,
    { stdio: 'ignore' },
  )
  const { readFileSync } = await import('fs')
  const key = readFileSync(keyPath)
  const cert = readFileSync(certPath)

  const server = new FtpSrv({
    url: `ftp://${host}:0`,
    pasv_url: host,
    anonymous: false,
    tls: { key, cert },
  })

  server.on('login', ({ username, password }, resolve, reject) => {
    if (username === 'test' && password === 'test') {
      resolve({ root: rootDir })
    } else {
      reject(new Error('Invalid credentials'))
    }
  })

  await server.listen()
  const address = (server as unknown as { server: { address: () => unknown } }).server.address()
  const port = typeof address === 'object' && address !== null ? (address as { port: number }).port : 0

  return {
    port,
    host,
    rootDir,
    url: `ftps://${host}:${port}`,
    stop: async () => {
      server.close()
      await rm(rootDir, { recursive: true, force: true })
    },
  }
}

export async function seedFiles(
  rootDir: string,
  structure: Record<string, string | Buffer>,
): Promise<void> {
  for (const [path, content] of Object.entries(structure)) {
    const fullPath = join(rootDir, path)
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
    await mkdir(dir, { recursive: true })
    await writeFile(fullPath, content)
  }
}

export async function cleanDir(rootDir: string): Promise<void> {
  const entries = await readdir(rootDir)
  for (const entry of entries) {
    await rm(join(rootDir, entry), { recursive: true, force: true })
  }
}
