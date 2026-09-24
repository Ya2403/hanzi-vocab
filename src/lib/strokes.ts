import type { CharacterJson, CharDataLoaderFn } from 'hanzi-writer';

/** Hanzi Writer stroke data (~9,000 characters), one small JSON file per character. */
const dataUrl = (char: string) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`;
const CACHE_NAME = 'hanzi-strokes-v1';

const CJK_CHAR = /[㐀-鿿豈-﫿]/;

/** The characters of a word that can be written (drops punctuation, latin, digits). */
export const writableChars = (text: string): string[] => [...text].filter((c) => CJK_CHAR.test(c));

const inFlight = new Map<string, Promise<CharacterJson>>();

async function openCache(): Promise<Cache | null> {
  try {
    return 'caches' in window ? await caches.open(CACHE_NAME) : null;
  } catch {
    return null;
  }
}

async function fetchStrokeData(char: string): Promise<CharacterJson> {
  const url = dataUrl(char);
  const cache = await openCache();
  const hit = await cache?.match(url);
  if (hit) return hit.json();
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? `No stroke data for “${char}”.` : `Download failed (${res.status}).`);
  await cache?.put(url, res.clone()).catch(() => {});
  return res.json();
}

/** Cache-first load; failed loads are forgotten so they can be retried. */
export function loadStrokeData(char: string): Promise<CharacterJson> {
  let p = inFlight.get(char);
  if (!p) {
    p = fetchStrokeData(char).catch((e: unknown) => {
      inFlight.delete(char);
      throw e;
    });
    inFlight.set(char, p);
  }
  return p;
}

export const charDataLoader: CharDataLoaderFn = (char, onLoad, onError) => {
  loadStrokeData(char).then(onLoad, onError);
};

/** Download stroke data for many characters (for offline writing practice). */
export async function prefetchStrokes(
  chars: string[],
  onProgress: (done: number, total: number) => void,
): Promise<{ failed: string[] }> {
  const queue = [...new Set(chars)];
  const total = queue.length;
  const failed: string[] = [];
  let done = 0;
  const worker = async () => {
    for (let c = queue.shift(); c !== undefined; c = queue.shift()) {
      try {
        await loadStrokeData(c);
      } catch {
        failed.push(c);
      }
      onProgress(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { failed };
}
