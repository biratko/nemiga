import yazl from 'yazl'
import { pack as tarPack } from 'tar-stream'

export function createZipBuffer(
  files: Record<string, string | Buffer>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile()
    for (const [name, content] of Object.entries(files)) {
      const buf = typeof content === 'string' ? Buffer.from(content) : content
      zip.addBuffer(buf, name)
    }
    zip.end()

    const chunks: Buffer[] = []
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
  })
}

export function createTarBuffer(
  files: Record<string, string | Buffer>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pack = tarPack()
    const chunks: Buffer[] = []

    pack.on('data', (chunk: Buffer) => chunks.push(chunk))
    pack.on('end', () => resolve(Buffer.concat(chunks)))
    pack.on('error', reject)

    for (const [name, content] of Object.entries(files)) {
      const buf = typeof content === 'string' ? Buffer.from(content) : content
      pack.entry({ name, size: buf.length }, buf)
    }
    pack.finalize()
  })
}
