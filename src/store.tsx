import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as db from './lib/db';
import { today } from './lib/date';
import { bumpStreak, emptyStreak } from './lib/streak';
import { cleanInput, createWord, newId } from './lib/words';
import { cleanSentenceInput, computeLinks, createSentence, migrateExamples, type Links } from './lib/sentences';
import { isLegacyWord, normalizeDialogue, normalizeSentence, normalizeWord, type ExportData } from './lib/io';
import { dedupeByHanzi, type Item } from './lib/syncMerge';
import { initSync, pushItemDeletes, pushItems, pushMeta, replaceAllRemote, type Collection } from './lib/sync';
import type { DailyStats, Dialogue, DialogueLine, NewWord, Sentence, SentenceInput, StreakState, Word } from './lib/types';

export type ImportMode = 'merge' | 'replace';

/** A dialogue line to create: the sentence and its speaker. */
export interface NewLine {
  input: SentenceInput;
  speaker?: string;
}

interface Store {
  words: Word[];
  sentences: Sentence[];
  dialogues: Dialogue[];
  /** Which words each sentence contains, and which sentences each word appears in. */
  links: Links;
  loading: boolean;
  error: string | null;
  streak: StreakState;
  daily: DailyStats;
  addWord(input: NewWord): Promise<Word>;
  addWords(inputs: NewWord[]): Promise<Word[]>;
  updateWord(word: Word): Promise<void>;
  updateWords(words: Word[]): Promise<void>;
  deleteWord(id: string): Promise<void>;
  addSentences(inputs: SentenceInput[]): Promise<Sentence[]>;
  updateSentences(sentences: Sentence[]): Promise<void>;
  deleteSentences(ids: string[]): Promise<void>;
  addDialogue(title: string, tags: string[], lines: NewLine[]): Promise<Dialogue>;
  updateDialogue(dialogue: Dialogue): Promise<void>;
  /** Delete a dialogue; its sentences are deleted too, or kept as loose sentences. */
  deleteDialogue(id: string, withSentences: boolean): Promise<void>;
  importData(data: ExportData & { hasSentences: boolean }, mode: ImportMode): Promise<{ added: number; skipped: number; sentences: number }>;
  /** Count one answered card toward today's stats. */
  recordReview(): Promise<void>;
  /** A finished practice (or learn) session: today counts for the streak. */
  completeSession(): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

/** One synced collection: React state + a ref for sync callbacks + IndexedDB + cloud pushes. */
function useCollection<T extends Item>(name: Collection) {
  const [items, setItems] = useState<T[]>([]);
  const ref = useRef(items);
  ref.current = items;

  const set = useCallback((next: T[]) => {
    ref.current = next;
    setItems(next);
  }, []);

  /** Save new or changed items (upsert by id). */
  const save = useCallback(
    async (list: T[], push = true) => {
      if (!list.length) return;
      await db.putAll(name, list as never);
      const byId = new Map(list.map((it) => [it.id, it]));
      const next = ref.current.map((it) => byId.get(it.id) ?? it);
      for (const it of list) if (!ref.current.some((x) => x.id === it.id)) next.push(it);
      set(next);
      if (push) pushItems(name, list);
    },
    [name, set],
  );

  const remove = useCallback(
    async (ids: string[], push = true) => {
      if (!ids.length) return;
      await db.deleteAll(name, ids);
      const gone = new Set(ids);
      set(ref.current.filter((it) => !gone.has(it.id)));
      if (push) pushItemDeletes(name, ids);
    },
    [name, set],
  );

  /** Make the collection exactly `list` (Replace all), here and in the cloud. */
  const replace = useCallback(
    async (list: T[]) => {
      const kept = new Set(list.map((it) => it.id));
      const removed = ref.current.filter((it) => !kept.has(it.id)).map((it) => it.id);
      await db.putAll(name, list as never, true);
      set(list);
      replaceAllRemote(name, list, removed).catch((e) => console.error(`Sync: replace ${name} failed`, e));
    },
    [name, set],
  );

  return { items, ref, set, save, remove, replace };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const W = useCollection<Word>('words');
  const S = useCollection<Sentence>('sentences');
  const D = useCollection<Dialogue>('dialogues');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakState>(emptyStreak);
  const [daily, setDaily] = useState<DailyStats>({ date: today(), reviews: 0 });

  useEffect(() => {
    Promise.all([db.getAllWords(), db.getAll('sentences'), db.getAll('dialogues'), db.getMeta('streak'), db.getMeta('daily')])
      .then(async ([stored, sentences, dialogues, st, dl]) => {
        // Words saved before per-skill schedules: migrate once and store the result. Their
        // updatedAt is kept, so the migration itself isn't pushed as an edit.
        const legacy = stored.filter(isLegacyWord);
        const migrated = legacy.map((w) => normalizeWord(w, w.updatedAt)).filter((w): w is Word => !!w);
        if (migrated.length) await db.putWords(migrated);
        const byId = new Map(migrated.map((w) => [w.id, w]));
        W.set(stored.map((w) => byId.get(w.id) ?? w));
        S.set(sentences);
        D.set(dialogues);
        if (st) setStreak(st);
        if (dl) setDaily(dl);
      })
      .catch((e: unknown) => {
        console.error(e);
        setError('Could not open the local database. Private browsing mode may block IndexedDB.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Word examples from before Sentence items (stored words, old backups, older devices, bulk-added
  // words with an example): turn them into sentences linked to the word.
  useEffect(() => {
    if (loading) return;
    const withExample = W.items.filter((w) => w.example !== undefined || w.exampleTranslation !== undefined || w.exampleRef !== undefined);
    if (!withExample.length) return;
    const { sentences, words } = migrateExamples(withExample, S.ref.current);
    const now = Date.now();
    S.save(sentences).catch((e) => console.error('Failed to migrate examples', e));
    W.save(words.map((w) => ({ ...w, updatedAt: now }))).catch((e) => console.error('Failed to migrate examples', e));
  }, [loading, W.items]);

  const links = useMemo(() => computeLinks(S.items, W.items), [S.items, W.items]);

  // ---------- Words ----------

  const withExample = (w: Word, example?: string): Word => (example?.trim() ? { ...w, example: example.trim() } : w);

  const addWord = useCallback(async (input: NewWord) => {
    const w = withExample(createWord(input), input.example);
    await W.save([w]);
    return w;
  }, []);

  const addWords = useCallback(async (inputs: NewWord[]) => {
    // One millisecond apart, so the list order survives (e.g. a lesson from Bulk add).
    const now = Date.now();
    const created = inputs.map((input, i) => withExample(createWord(input, now + i), input.example));
    await W.save(created);
    return created;
  }, []);

  const updateWord = useCallback(async (word: Word) => {
    await W.save([{ ...word, ...cleanInput(word), updatedAt: Date.now() }]);
  }, []);

  /** Save several edited words in one transaction (bulk actions). */
  const updateWords = useCallback(async (list: Word[]) => {
    const now = Date.now();
    await W.save(list.map((w) => ({ ...w, ...cleanInput(w), updatedAt: now })));
  }, []);

  const deleteWord = useCallback(async (id: string) => {
    await W.remove([id]);
  }, []);

  // ---------- Sentences & dialogues ----------

  const addSentences = useCallback(async (inputs: SentenceInput[]) => {
    const now = Date.now();
    const created = inputs.map((input, i) => createSentence(input, now + i));
    await S.save(created);
    return created;
  }, []);

  const updateSentences = useCallback(async (list: Sentence[]) => {
    const now = Date.now();
    await S.save(list.map((s) => ({ ...s, ...cleanSentenceInput(s), updatedAt: now })));
  }, []);

  const deleteSentences = useCallback(async (ids: string[]) => {
    const gone = new Set(ids);
    // Remove them from their dialogues too.
    const now = Date.now();
    const touched = D.ref.current
      .filter((d) => d.lines.some((l) => gone.has(l.sentenceId)))
      .map((d) => ({ ...d, lines: d.lines.filter((l) => !gone.has(l.sentenceId)), updatedAt: now }));
    await D.save(touched);
    await S.remove(ids);
  }, []);

  const addDialogue = useCallback(async (title: string, tags: string[], lines: NewLine[]) => {
    const now = Date.now();
    const id = newId();
    const sentences = lines.map((l, i) => ({ ...createSentence(l.input, now + i), dialogueId: id }));
    const lineList: DialogueLine[] = sentences.map((s, i) => ({ sentenceId: s.id, speaker: lines[i].speaker?.trim() || undefined }));
    const dialogue: Dialogue = { id, title: title.trim() || 'Dialogue', tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))], lines: lineList, createdAt: now, updatedAt: now };
    await S.save(sentences);
    await D.save([dialogue]);
    return dialogue;
  }, []);

  const updateDialogue = useCallback(async (dialogue: Dialogue) => {
    await D.save([{ ...dialogue, title: dialogue.title.trim() || 'Dialogue', updatedAt: Date.now() }]);
  }, []);

  const deleteDialogue = useCallback(async (id: string, withSentences: boolean) => {
    const own = S.ref.current.filter((s) => s.dialogueId === id);
    if (withSentences) await S.remove(own.map((s) => s.id));
    else {
      const now = Date.now();
      await S.save(own.map((s) => ({ ...s, dialogueId: undefined, updatedAt: now })));
    }
    await D.remove([id]);
  }, []);

  // ---------- Import ----------

  const importData = useCallback(async (data: ExportData & { hasSentences: boolean }, mode: ImportMode) => {
    if (mode === 'replace') {
      // The file becomes the whole list. Stamp everything as changed now so it wins over any
      // version already on this or another device (progress from the file is kept).
      const now = Date.now();
      const stamp = <T extends Item>(list: T[]) => list.map((it, i) => ({ ...it, updatedAt: now + i }));
      await W.replace(stamp(data.words));
      await S.replace(stamp(data.sentences));
      await D.replace(stamp(data.dialogues));
      return { added: data.words.length, skipped: 0, sentences: data.sentences.length };
    }
    // Merge: keep what's here, add only words (by id and hanzi) and sentences (by id and text) that are new.
    const ids = new Set(W.ref.current.map((w) => w.id));
    const hanzi = new Set(W.ref.current.map((w) => w.hanzi));
    const fresh: Word[] = [];
    for (const w of data.words) {
      if (ids.has(w.id) || hanzi.has(w.hanzi)) continue;
      ids.add(w.id);
      hanzi.add(w.hanzi);
      fresh.push(w);
    }
    await W.save(fresh);

    const byZh = new Map(S.ref.current.map((s) => [s.zh, s.id]));
    const sIds = new Set(S.ref.current.map((s) => s.id));
    const remap = new Map<string, string>(); // file sentence id → the sentence it became here
    const newSentences: Sentence[] = [];
    for (const s of data.sentences) {
      const same = sIds.has(s.id) ? s.id : byZh.get(s.zh);
      if (same) remap.set(s.id, same);
      else {
        newSentences.push(s);
        sIds.add(s.id);
        byZh.set(s.zh, s.id);
        remap.set(s.id, s.id);
      }
    }
    await S.save(newSentences);
    const dIds = new Set(D.ref.current.map((d) => d.id));
    const newDialogues = data.dialogues
      .filter((d) => !dIds.has(d.id))
      .map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l, sentenceId: remap.get(l.sentenceId) ?? l.sentenceId })) }));
    await D.save(newDialogues);
    return { added: fresh.length, skipped: data.words.length - fresh.length, sentences: newSentences.length };
  }, []);

  // ---------- Streak ----------

  // Refs so rapid consecutive answers never build on a stale render's values.
  const streakRef = useRef(streak);
  const dailyRef = useRef(daily);
  streakRef.current = streak;
  dailyRef.current = daily;

  const saveMeta = async (nextStreak: StreakState, nextDaily: DailyStats) => {
    streakRef.current = nextStreak;
    dailyRef.current = nextDaily;
    setStreak(nextStreak);
    setDaily(nextDaily);
    await Promise.all([db.setMeta('streak', nextStreak), db.setMeta('daily', nextDaily)]);
    pushMeta({ streak: nextStreak, daily: nextDaily });
  };

  const recordReview = useCallback(async () => {
    const on = today();
    const prevDaily = dailyRef.current;
    await saveMeta(streakRef.current, { date: on, reviews: (prevDaily.date === on ? prevDaily.reviews : 0) + 1 });
  }, []);

  const completeSession = useCallback(async () => {
    const on = today();
    const prevDaily = dailyRef.current;
    await saveMeta(bumpStreak(streakRef.current, on), prevDaily.date === on ? prevDaily : { date: on, reviews: 0 });
  }, []);

  // ---------- Sync ----------

  // Start cloud sync once local data is loaded. Remote changes are applied here directly
  // (not through the functions above), so they aren't pushed straight back.
  useEffect(() => {
    if (loading || error) return;
    initSync({
      collections: {
        words: {
          get: () => W.ref.current,
          applyRemote: async (incoming, deleteIds) => {
            // A device still on an older version may send words without skills.
            const upserts = (incoming as Word[]).map((w) => (isLegacyWord(w) ? (normalizeWord(w, w.updatedAt) ?? w) : w));
            await W.save(upserts, false);
            await W.remove(deleteIds, false);
          },
          duplicates: (items) => dedupeByHanzi(items as Word[]).drop,
        },
        sentences: {
          get: () => S.ref.current,
          applyRemote: async (incoming, deleteIds) => {
            await S.save(incoming.map((x) => normalizeSentence(x, x.updatedAt)).filter((x): x is Sentence => !!x), false);
            await S.remove(deleteIds, false);
          },
        },
        dialogues: {
          get: () => D.ref.current,
          applyRemote: async (incoming, deleteIds) => {
            await D.save(incoming.map((x) => normalizeDialogue(x, x.updatedAt)).filter((x): x is Dialogue => !!x), false);
            await D.remove(deleteIds, false);
          },
        },
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
      words: W.items,
      sentences: S.items,
      dialogues: D.items,
      links,
      loading,
      error,
      streak,
      daily,
      addWord,
      addWords,
      updateWord,
      updateWords,
      deleteWord,
      addSentences,
      updateSentences,
      deleteSentences,
      addDialogue,
      updateDialogue,
      deleteDialogue,
      importData,
      recordReview,
      completeSession,
    }),
    [W.items, S.items, D.items, links, loading, error, streak, daily],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
