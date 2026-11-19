type Entry = { group: string; expires: number; request: Promise<unknown> };

export function createViewReads(limit = 40, ttl = 15_000, now = Date.now) {
  const entries = new Map<string, Entry>();

  function read<T>(group: string, key: string, load: () => Promise<T>): Promise<T> {
    const cacheKey = `${group}:${key}`;
    const cached = entries.get(cacheKey);
    if (cached && cached.expires > now()) return cached.request as Promise<T>;
    const entry: Entry = { group, expires: Infinity, request: Promise.resolve(null) };
    const request = Promise.resolve().then(load).then(value => {
      entry.expires = now() + ttl;
      return value;
    }, error => {
      if (entries.get(cacheKey) === entry) entries.delete(cacheKey);
      throw error;
    });
    entry.request = request;
    entries.delete(cacheKey);
    entries.set(cacheKey, entry);
    const oldest = entries.keys().next().value;
    if (entries.size > limit && oldest !== undefined) entries.delete(oldest);
    return request;
  }

  function invalidate(...groups: string[]) {
    if (!groups.length) entries.clear();
    else for (const [key,entry] of entries) if (groups.includes(entry.group)) entries.delete(key);
  }

  return { read, invalidate };
}

export const organizerReads = createViewReads();
export const publicCatalogReads = createViewReads(20, 15_000);
