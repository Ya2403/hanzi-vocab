import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DailyStats, StreakState, Word } from './types';

interface MetaValues {
  streak: StreakState;
  daily: DailyStats;
}
type MetaKey = keyof MetaValues;

interface VocabDB extends DBSchema {
  words: {
    key: string;
    value: Word;
    indexes: { 'by-hanzi': string; 'by-due': string };
  };
  meta: {
    key: MetaKey;
    value: MetaValues[MetaKey];
  };
}

let dbPromise: Promise<IDBPDatabase<VocabDB>> | null = null;

function db(): Promise<IDBPDatabase<VocabDB>> {
  dbPromise ??= openDB<VocabDB>('hanzi-vocab', 1, {
    upgrade(database) {
      const words = database.createObjectStore('words', { keyPath: 'id' });
      words.createIndex('by-hanzi', 'hanzi');
      words.createIndex('by-due', 'srs.due');
      database.createObjectStore('meta');
    },
  });
  return dbPromise;
}

export async function getAllWords(): Promise<Word[]> {
  return (await db()).getAll('words');
}

export async function putWord(word: Word): Promise<void> {
  await (await db()).put('words', word);
}

export async function deleteWord(id: string): Promise<void> {
  await (await db()).delete('words', id);
}

/** Write many words in one transaction, optionally clearing the store first. */
export async function putWords(words: Word[], replace = false): Promise<void> {
  const tx = (await db()).transaction('words', 'readwrite');
  if (replace) await tx.store.clear();
  await Promise.all([...words.map((w) => tx.store.put(w)), tx.done]);
}

export async function getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined> {
  return (await (await db()).get('meta', key)) as MetaValues[K] | undefined;
}

export async function setMeta<K extends MetaKey>(key: K, value: MetaValues[K]): Promise<void> {
  await (await db()).put('meta', value, key);
}
