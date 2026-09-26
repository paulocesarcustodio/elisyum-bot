import NodeCache from 'node-cache'

export function setBoundedCache<T>(cache: NodeCache, key: string, value: T, maxKeys: number, ttl?: number): void {
    if (!cache.has(key) && cache.keys().length >= maxKeys) {
        const oldestKey = cache.keys()[0]
        if (oldestKey !== undefined) cache.del(oldestKey)
    }

    if (ttl === undefined) cache.set(key, value)
    else cache.set(key, value, ttl)
}
