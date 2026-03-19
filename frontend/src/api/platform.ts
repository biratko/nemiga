let cachedPlatform: string | null = null

export async function getPlatform(): Promise<string> {
    if (cachedPlatform) return cachedPlatform
    const res = await fetch('/api/platform')
    const data = await res.json()
    cachedPlatform = data.platform as string
    return cachedPlatform!
}
