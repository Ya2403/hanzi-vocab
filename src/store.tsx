import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as db from './lib/db';
import { today } from './lib/date';
import { bumpStreak, emptyStreak } from './lib/streak';
import { cleanInput, createWord } from './lib/words';
import type { DailyStats, StreakState, Word, WordInput } from './lib/types';

export type ImportMode = 'merge' | 'replace';

interface Store {
  words: Word[];
  loading: boolean;
  error: string | null;
  streak: StreakState;
  daily: DailyStats;
  addWord(input: WordInput): Promise<Word>;
  addWords(inputs: WordInput[]): Promise<void>;
  updateWord(word: Word): Promise<void>;
  deleteWord(id: string): Promise<void>;
  importWords(words: Word[], mode: ImportMode): Promise<{ added: number; skipped: number }>;
  /** Count one answered card toward today's stats and the streak. */
  recordReview(): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakState>(emptyStreak);
  const [daily, setDaily] = useState<DailyStats>({ date: today(), reviews: 0 });

  useEffect(() => {
    Promise.all([db.getAllWords(), db.getMeta('streak'), db.getMeta('daily')])
      .then(([ws, st, dl]) => {
        setWords(ws);
        if (st) setStreak(st);
        if (dl) setDaily(dl);
      })
      .catch((e: unknown) => {
        console.error(e);
        setError('Could not open the local database. Private browsing mode may block IndexedDB.');
      })
      .finally(() => setLoading(false));
  }, []);

  const addWord = useCallback(async (input: WordInput) => {
    const w = createWord(input);
    await db.putWord(w);
    setWords((ws) => [...ws, w]);
    return w;
  }, []);

  const addWords = useCallback(async (inputs: WordInput[]) => {
    const created = inputs.map(createWord);
    await db.putWords(created);
    setWords((ws) => [...ws, ...created]);
  }, []);

  const updateWord = useCallback(async (word: Word) => {
    const updated: Word = { ...word, ...cleanInput(word), updatedAt: Date.now() };
    await db.putWord(updated);
    setWords((ws) => ws.map((w) => (w.id === updated.id ? updated : w)));
  }, []);

  const deleteWord = useCallback(async (id: string) => {
    await db.deleteWord(id);
    setWords((ws) => ws.filter((w) => w.id !== id));
  }, []);

  const importWords = useCallback(
    async (incoming: Word[], mode: ImportMode) => {
      if (mode === 'replace') {
        await db.putWords(incoming, true);
        setWords(incoming);
        return { added: incoming.length, skipped: 0 };
      }
      // Merge: keep existing words, add only those whose id and hanzi are both new.
      const ids = new Set(words.map((w) => w.id));
      const hanzi = new Set(words.map((w) => w.hanzi));
      const fresh: Word[] = [];
      for (const w of incoming) {
        if (ids.has(w.id) || hanzi.has(w.hanzi)) continue;
        ids.add(w.id);
        hanzi.add(w.hanzi);
        fresh.push(w);
      }
      await db.putWords(fresh);
      setWords((ws) => [...ws, ...fresh]);
      return { added: fresh.length, skipped: incoming.length - fresh.length };
    },
    [words],
  );

  // Refs so rapid consecutive answers never build on a stale render's values.
  const streakRef = useRef(streak);
  const dailyRef = useRef(daily);
  streakRef.current = streak;
  dailyRef.current = daily;

  const recordReview = useCallback(async () => {
    const on = today();
    const prevDaily = dailyRef.current;
    const nextStreak = bumpStreak(streakRef.current, on);
    const nextDaily = { date: on, reviews: (prevDaily.date === on ? prevDaily.reviews : 0) + 1 };
    streakRef.current = nextStreak;
    dailyRef.current = nextDaily;
    setStreak(nextStreak);
    setDaily(nextDaily);
    await Promise.all([db.setMeta('streak', nextStreak), db.setMeta('daily', nextDaily)]);
  }, []);

  const value = useMemo<Store>(
    () => ({
      words, loading, error, streak, daily,
      addWord, addWords, updateWord, deleteWord, importWords, recordReview,
    }),
    [words, loading, error, streak, daily, addWord, addWords, updateWord, deleteWord, importWords, recordReview],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
