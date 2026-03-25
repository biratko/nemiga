import path from 'node:path'

const ARCHIVE_SUFFIXES = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar', '.zip', '.7z', '.gz', '.bz2']

export function stripArchiveSuffix(filename: string): string {
    const lower = filename.toLowerCase()
    for (const suffix of ARCHIVE_SUFFIXES) {
        if (lower.endsWith(suffix)) {
            return filename.slice(0, -suffix.length)
        }
    }
    return path.parse(filename).name
}
