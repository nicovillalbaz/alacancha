type Entry = { group: string; key: string; expires: number; request: Promise<unknown>; value?: unknown };

export function createViewReads(limit = 40, ttl = 15_000, now = Date.now) {
  const entries = new Map<string, Entry>();

  function read<T>(group: string, key: string, load: () => Promise<T>): Promise<T> {
    const cacheKey = `${group}:${key}`;
    const cached = entries.get(cacheKey);
    if (cached && cached.expires > now()) return cached.request as Promise<T>;
    const entry: Entry = { group, key, expires: Infinity, request: Promise.resolve(null), value: cached?.value };
    const request = Promise.resolve().then(load).then(value => {
      entry.expires = now() + ttl;
      entry.value = value;
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

  function peek<T>(group: string, key: string) {
    return entries.get(`${group}:${key}`)?.value as T | undefined;
  }

  function invalidateWhere(matches: (group: string, key: string) => boolean) {
    for (const [id, entry] of entries) if (matches(entry.group, entry.key)) entries.delete(id);
  }

  return { read, invalidate, invalidateWhere, peek };
}

export const organizerReads = createViewReads();
export const publicCatalogReads = createViewReads(20, 15_000);
