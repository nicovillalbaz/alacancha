import { ref, type InjectionKey } from 'vue';

const MAX_IMAGES = 128;
const MAX_BYTES = 4 * 1024 * 1024;
const REUSE_MS = 120_000;

export function createOrganizerImages() {
  type Saved = { url: string; expiresAt: number; size: number };
  const images = new Map<string, Saved>();
  const requests = new Map<string, { abort: AbortController; result: Promise<string | undefined> }>();
  const revision = ref(0);
  let bytes = 0;

  function forget(path: string) {
    const image = images.get(path);
    if (!image) return;
    images.delete(path);
    bytes -= image.size;
    URL.revokeObjectURL(image.url);
  }

  function peek(path: string) {
    const image = images.get(path);
    if (!image) return;
    if (Date.now() >= image.expiresAt) {
      forget(path);
      return;
    }
    images.delete(path);
    images.set(path, image);
    return image.url;
  }

  async function load(path: string) {
    const cached = peek(path);
    if (cached) return cached;
    const inFlight = requests.get(path);
    if (inFlight) return inFlight.result;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 12_000);
    const result = (async () => {
      try {
        const response = await fetch(`${path}?size=128`, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return;
        const blob = await response.blob();
        if (abort.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        images.set(path, { url, expiresAt: Date.now() + REUSE_MS, size: blob.size });
        bytes += blob.size;
        while (images.size > 1 && (images.size > MAX_IMAGES || bytes > MAX_BYTES)) forget(images.keys().next().value!);
        return url;
      } catch {
        return undefined;
      } finally {
        clearTimeout(timer);
        if (requests.get(path)?.abort === abort) requests.delete(path);
      }
    })();
    requests.set(path, { abort, result });
    return result;
  }

  function invalidate(path: string) {
    requests.get(path)?.abort.abort();
    requests.delete(path);
    forget(path);
    revision.value++;
  }

  function clear() {
    for (const request of requests.values()) request.abort.abort();
    requests.clear();
    for (const path of images.keys()) forget(path);
    revision.value++;
  }

  return { revision, peek, load, invalidate, clear };
}

export const organizerImagesKey: InjectionKey<ReturnType<typeof createOrganizerImages>> = Symbol('organizerImages');
