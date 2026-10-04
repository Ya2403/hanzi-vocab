import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DailyStats, Dialogue, Sentence, StreakState, Word } from './types';

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
  sentences: {
    key: string;
    value: Sentence;
  };
  dialogues: {
    key: string;
    value: Dialogue;
  };
  meta: {
    key: MetaKey;
    value: MetaValues[MetaKey];
  };
}

/** Object stores holding items with an id (words, sentences, dialogues). */
export type ItemStore = 'words' | 'sentences' | 'dialogues';
type ItemOf<S extends ItemStore> = VocabDB[S]['value'];

let dbPromise: Promise<IDBPDatabase<VocabDB>> | null = null;

function db(): Promise<IDBPDatabase<VocabDB>> {
  dbPromise ??= openDB<VocabDB>('hanzi-vocab', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const words = database.createObjectStore('words', { keyPath: 'id' });
        words.createIndex('by-hanzi', 'hanzi');
        words.createIndex('by-due', 'srs.due');
        database.createObjectStore('meta');
      }
      if (oldVersion < 2) {
        // Version 2: sentences and dialogues.
        database.createObjectStore('sentences', { keyPath: 'id' });
        database.createObjectStore('dialogues', { keyPath: 'id' });
      }
    },
    // A newer version of the app (another tab, or after an update) needs to upgrade the
    // database: let go of it and reload, instead of blocking the upgrade.
    blocking() {
      void dbPromise?.then((d) => d.close());
      dbPromise = null;
      location.reload();
    },
  });
  return dbPromise;
}

export async function getAll<S extends ItemStore>(store: S): Promise<ItemOf<S>[]> {
  return (await db()).getAll(store) as Promise<ItemOf<S>[]>;
}

/** Write many items in one transaction, optionally clearing the store first. */
export async function putAll<S extends ItemStore>(store: S, items: ItemOf<S>[], replace = false): Promise<void> {
  const tx = (await db()).transaction(store, 'readwrite');
  if (replace) await tx.store.clear();
  await Promise.all([...items.map((it) => tx.store.put(it as never)), tx.done]);
}

export async function deleteAll(store: ItemStore, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const tx = (await db()).transaction(store, 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

// Words (kept for readability at call sites).
export const getAllWords = () => getAll('words');
export const putWord = (word: Word) => putAll('words', [word]);
export const deleteWord = (id: string) => deleteAll('words', [id]);
export const putWords = (words: Word[], replace = false) => putAll('words', words, replace);

export async function getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined> {
  return (await (await db()).get('meta', key)) as MetaValues[K] | undefined;
}

export async function setMeta<K extends MetaKey>(key: K, value: MetaValues[K]): Promise<void> {
  await (await db()).put('meta', value, key);
}
