/** Remove leading and trailing slashes from a path segment. */
export function stripSlashes(p: string): string {
    return p.replace(/^\/+|\/+$/g, '')
}
