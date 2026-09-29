/**
 * Pure merge rules for cloud sync (no Firebase here, so they can be unit-tested).
 *
 * Every word carries `updatedAt` (set on each edit/review); for the same word id the newer
 * version wins. Deleting leaves a tombstone so the deletion reaches other devices too.
 */
import type { DailyStats, SkillState, StreakState, Word } from './types';

export interface Tombstone {
  id: string;
  deleted: true;
  updatedAt: number;
}

export type RemoteDoc = Word | Tombstone;

export const isTombstone = (d: RemoteDoc): d is Tombstone => (d as Tombstone).deleted === true;

/** Which remote changes to apply locally. */
export function planRemoteApply(local: Map<string, Word>, remote: RemoteDoc[]): { upserts: Word[]; deletes: string[] } {
  const upserts: Word[] = [];
  const deletes: string[] = [];
  for (const r of remote) {
    const l = local.get(r.id);
    if (isTombstone(r)) {
      // A local edit made after the deletion wins (and will be pushed back up).
      if (l && l.updatedAt <= r.updatedAt) deletes.push(r.id);
    } else if (!l || r.updatedAt > l.updatedAt) {
      upserts.push(r);
    }
  }
  return { upserts, deletes };
}

/** On the first sync from a device: local words the server doesn't have, or has an older version of. */
export function planInitialPush(local: Word[], remote: Map<string, RemoteDoc>): Word[] {
  return local.filter((l) => {
    const r = remote.get(l.id);
    return !r || l.updatedAt > r.updatedAt;
  });
}

/**
 * Words with the same characters added separately on two devices (different ids) would appear
 * twice after syncing. Keep one per hanzi: the one studied most recently, then the newest edit.
 */
export function dedupeByHanzi(words: Word[]): { drop: Word[] } {
  const best = new Map<string, Word>();
  const drop: Word[] = [];
  const states = (w: Word) => Object.values(w.skills ?? {}) as SkillState[];
  const score = (w: Word) =>
    [
      states(w).reduce((m, s) => (s.lastReviewed && s.lastReviewed > m ? s.lastReviewed : m), ''),
      states(w).reduce((n, s) => n + s.reps, 0),
      w.updatedAt,
    ] as const;
  const better = (a: Word, b: Word) => {
    const [sa, sb] = [score(a), score(b)];
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i];
    return a.id < b.id; // deterministic, so both devices drop the same one
  };
  for (const w of words) {
    const key = w.hanzi.trim();
    const cur = best.get(key);
    if (!cur) best.set(key, w);
    else if (better(w, cur)) {
      drop.push(cur);
      best.set(key, w);
    } else drop.push(w);
  }
  return { drop };
}

export interface SyncMeta {
  streak: StreakState;
  daily: DailyStats;
}

/** Combine streak/daily counters from two devices without losing either side's progress. */
export function mergeMeta(a: SyncMeta, b: SyncMeta): SyncMeta {
  const la = a.streak.lastDate ?? '';
  const lb = b.streak.lastDate ?? '';
  const streakSrc = la > lb ? a.streak : lb > la ? b.streak : a.streak.current >= b.streak.current ? a.streak : b.streak;
  const streak = { ...streakSrc, longest: Math.max(a.streak.longest, b.streak.longest, streakSrc.current) };
  const daily =
    a.daily.date === b.daily.date
      ? { date: a.daily.date, reviews: Math.max(a.daily.reviews, b.daily.reviews) }
      : a.daily.date > b.daily.date
        ? a.daily
        : b.daily;
  return { streak, daily };
}

export const sameMeta = (a: SyncMeta, b: SyncMeta) => JSON.stringify(a) === JSON.stringify(b);
