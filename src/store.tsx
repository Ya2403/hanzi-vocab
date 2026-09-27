import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as db from './lib/db';
import { today } from './lib/date';
import { bumpStreak, emptyStreak } from './lib/streak';
import { cleanInput, createWord } from './lib/words';
import { initSync, pushDeletes, pushMeta, pushWords } from './lib/sync';
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
  updateWords(words: Word[]): Promise<void>;
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

  // Latest values for sync callbacks (which outlive renders).
  const wordsRef = useRef(words);
  wordsRef.current = words;

  const addWord = useCallback(async (input: WordInput) => {
    const w = createWord(input);
    await db.putWord(w);
    setWords((ws) => [...ws, w]);
    pushWords([w]);
    return w;
  }, []);

  const addWords = useCallback(async (inputs: WordInput[]) => {
    // One millisecond apart, so the list order survives (e.g. a lesson from Bulk add).
    const now = Date.now();
    const created = inputs.map((input, i) => createWord(input, now + i));
    await db.putWords(created);
    setWords((ws) => [...ws, ...created]);
    pushWords(created);
  }, []);

  const updateWord = useCallback(async (word: Word) => {
    const updated: Word = { ...word, ...cleanInput(word), updatedAt: Date.now() };
    await db.putWord(updated);
    setWords((ws) => ws.map((w) => (w.id === updated.id ? updated : w)));
    pushWords([updated]);
  }, []);

  /** Save several edited words in one transaction (bulk actions). */
  const updateWords = useCallback(async (list: Word[]) => {
    const now = Date.now();
    const updated = list.map((w) => ({ ...w, ...cleanInput(w), updatedAt: now }));
    await db.putWords(updated);
    const byId = new Map(updated.map((w) => [w.id, w]));
    setWords((ws) => ws.map((w) => byId.get(w.id) ?? w));
    pushWords(updated);
  }, []);

  const deleteWord = useCallback(async (id: string) => {
    await db.deleteWord(id);
    setWords((ws) => ws.filter((w) => w.id !== id));
    pushDeletes([id]);
  }, []);

  const importWords = useCallback(
    async (incoming: Word[], mode: ImportMode) => {
      if (mode === 'replace') {
        await db.putWords(incoming, true);
        const kept = new Set(incoming.map((w) => w.id));
        pushDeletes(words.filter((w) => !kept.has(w.id)).map((w) => w.id));
        pushWords(incoming);
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
      pushWords(fresh);
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
    pushMeta({ streak: nextStreak, daily: nextDaily });
  }, []);

  // Start cloud sync once local data is loaded. Remote changes are applied here directly
  // (not through the functions above), so they aren't pushed straight back.
  useEffect(() => {
    if (loading || error) return;
    initSync({
      getWords: () => wordsRef.current,
      applyRemote: async (upserts, deleteIds) => {
        if (upserts.length) await db.putWords(upserts);
        for (const id of deleteIds) await db.deleteWord(id);
        const byId = new Map(upserts.map((w) => [w.id, w]));
        const gone = new Set(deleteIds);
        const next = wordsRef.current.filter((w) => !gone.has(w.id)).map((w) => byId.get(w.id) ?? w);
        for (const w of upserts) if (!next.some((x) => x.id === w.id)) next.push(w);
        wordsRef.current = next;
        setWords(next);
      },
      getMeta: () => ({ streak: streakRef.current, daily: dailyRef.current }),
      applyMeta: async (m) => {
        streakRef.current = m.streak;
        dailyRef.current = m.daily;
        setStreak(m.streak);
        setDaily(m.daily);
        await Promise.all([db.setMeta('streak', m.streak), db.setMeta('daily', m.daily)]);
      },
    });
  }, [loading, error]);

  const value = useMemo<Store>(
    () => ({
      words, loading, error, streak, daily,
      addWord, addWords, updateWord, updateWords, deleteWord, importWords, recordReview,
    }),
    [words, loading, error, streak, daily, addWord, addWords, updateWord, updateWords, deleteWord, importWords, recordReview],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
