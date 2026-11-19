export function createPublicReads(limit = 12) {
  const cache = new Map<string, { request: Promise<unknown>; expires: number }>();
  return function read<T>(path: string, revision: string, ttl = 15_000): Promise<T> {
    const key = `${revision}:${path}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.request as Promise<T>;
    const entry = { request: Promise.resolve<unknown>(null), expires: Infinity };
    const request = fetch(`/api/v1/public${path}`, {
      credentials: 'omit',
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(12_000) : undefined,
    }).then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as T;
      entry.expires = Date.now() + ttl;
      return data;
    }).catch(cause => {
      if (cache.get(key) === entry) cache.delete(key);
      throw cause;
    });
    entry.request = request;
    cache.set(key, entry);
    const oldest = cache.keys().next().value;
    if (cache.size > limit && oldest !== undefined) cache.delete(oldest);
    return request;
  };
}
