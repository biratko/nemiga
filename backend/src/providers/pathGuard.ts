import path from 'node:path'

export class PathGuard {
    private roots: string[] | null

    constructor(roots?: string[]) {
        this.roots = roots?.map(r => path.resolve(r)) ?? null
    }

    get enabled(): boolean {
        return this.roots !== null
    }

    get allowedRoots(): string[] | null {
        return this.roots ? [...this.roots] : null
    }

    assert(targetPath: string): void {
        if (!this.roots) return

        const resolved = path.resolve(targetPath)
        const allowed = this.roots.some(
            root => resolved === root || resolved.startsWith(root + path.sep),
        )
        if (!allowed) {
            throw new PathGuardError(resolved)
        }
    }

    assertAll(paths: string[]): void {
        for (const p of paths) {
            this.assert(p)
        }
    }
}

export class PathGuardError extends Error {
    constructor(targetPath: string) {
        super(`Access denied: path outside allowed roots: ${targetPath}`)
    }
}
