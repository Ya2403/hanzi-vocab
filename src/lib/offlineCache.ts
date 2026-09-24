/**
 * Cache-first JSON loading via Cache Storage, for data fetched on demand
 * (stroke data, character dictionary) that should keep working offline.
 */

export async function openCache(name: string): Promise<Cache | null> {
  try {
    return 'caches' in window ? await caches.open(name) : null;
  } catch {
    return null;
  }
}

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Download failed (${status}).`);
  }
}

/** Serve `url` from the cache if present; otherwise fetch it and store a copy. */
export async function cachedFetchJson<T>(url: string, cacheName: string): Promise<T> {
  const cache = await openCache(cacheName);
  const hit = await cache?.match(url);
  if (hit) return hit.json() as Promise<T>;
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(res.status);
  await cache?.put(url, res.clone()).catch(() => {});
  return res.json() as Promise<T>;
}

export async function isCached(url: string, cacheName: string): Promise<boolean> {
  const cache = await openCache(cacheName);
  return !!(await cache?.match(url));
}

/** Remove every entry except `keepUrl` (e.g. previous versions of a hashed file). */
export async function pruneCache(cacheName: string, keepUrl: string): Promise<void> {
  const cache = await openCache(cacheName);
  if (!cache) return;
  const keep = new URL(keepUrl, location.href).href;
  for (const req of await cache.keys()) if (req.url !== keep) await cache.delete(req);
}
