import { describe, expect, it } from 'vitest';
import { dedupeByHanzi, mergeMeta, planInitialPush, planRemoteApply, type RemoteDoc } from './syncMerge';
import { newSrs } from './srs';
import type { Word } from './types';

const w = (id: string, updatedAt: number, extra: Partial<Word> = {}): Word => ({
  id,
  hanzi: id,
  pinyin: '',
  meaning: '',
  tags: [],
  createdAt: 0,
  updatedAt,
  skills: {},
  ...extra,
});
const map = (ws: Word[]) => new Map(ws.map((x) => [x.id, x]));

describe('planRemoteApply', () => {
  it('takes remote words that are new or newer, ignores older ones', () => {
    const local = map([w('a', 10), w('b', 30)]);
    const { upserts } = planRemoteApply(local, [w('a', 20), w('b', 20), w('c', 5)]);
    expect(upserts.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('applies a deletion unless the word was edited locally after it', () => {
    const local = map([w('a', 10), w('b', 50)]);
    const remote: RemoteDoc[] = [
      { id: 'a', deleted: true, updatedAt: 20 },
      { id: 'b', deleted: true, updatedAt: 20 },
      { id: 'x', deleted: true, updatedAt: 20 },
    ];
    expect(planRemoteApply(local, remote).deletes).toEqual(['a']);
  });

  it('treats its own echoed write (same timestamp) as a no-op', () => {
    const plan = planRemoteApply(map([w('a', 10)]), [w('a', 10)]);
    expect(plan).toEqual({ upserts: [], deletes: [] });
  });
});

describe('planInitialPush', () => {
  it('pushes local-only words and local versions that are newer', () => {
    const remote = new Map<string, RemoteDoc>([
      ['a', w('a', 20)],
      ['b', w('b', 5)],
    ]);
    expect(planInitialPush([w('a', 10), w('b', 10), w('c', 1)], remote).map((x) => x.id)).toEqual(['b', 'c']);
  });
});

describe('dedupeByHanzi', () => {
  it('keeps the copy studied most recently when the same word was added on two devices', () => {
    const phone = w('p1', 100, { hanzi: '你好', skills: { meaning: { ...newSrs(), reps: 2, lastReviewed: '2026-09-26' } } });
    const tablet = w('t1', 200, { hanzi: '你好' });
    expect(dedupeByHanzi([phone, tablet]).drop.map((x) => x.id)).toEqual(['t1']);
  });

  it('picks the same survivor regardless of order (both devices agree)', () => {
    const a = w('id-a', 100, { hanzi: '猫' });
    const b = w('id-b', 100, { hanzi: '猫' });
    expect(dedupeByHanzi([a, b]).drop[0].id).toBe(dedupeByHanzi([b, a]).drop[0].id);
  });
});

describe('mergeMeta', () => {
  it('keeps the streak from the device that studied most recently, and the best longest', () => {
    const phone = { streak: { current: 5, longest: 9, lastDate: '2026-09-27' }, daily: { date: '2026-09-27', reviews: 12 } };
    const tablet = { streak: { current: 3, longest: 3, lastDate: '2026-09-26' }, daily: { date: '2026-09-27', reviews: 20 } };
    const m = mergeMeta(tablet, phone);
    expect(m.streak).toEqual({ current: 5, longest: 9, lastDate: '2026-09-27' });
    expect(m.daily).toEqual({ date: '2026-09-27', reviews: 20 });
  });
});
