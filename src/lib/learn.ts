import { addDays, today } from './date';
import { deepComponents, type HanziDict } from './hanziDict';
import { writableChars } from './strokes';
import type { SrsState, Word } from './types';

// ---------- Radical-only entries ----------

/** Bound radical forms that don't stand alone as words (and have no reading of their own). */
const RADICAL_FORMS = new Set([...'氵扌讠亻忄冫犭纟饣钅礻衤艹宀辶阝刂亠冖丷灬罒彳攵夂爫疒廴彐']);

/** A word that is just a radical form (氵, 扌, 讠 …): taught, but only recognition rounds. */
export function isRadicalOnly(w: Pick<Word, 'hanzi'>): boolean {
  const chars = [...w.hanzi.trim()];
  if (chars.length !== 1) return false;
  const cp = chars[0].codePointAt(0)!;
  // Also the Unicode radical blocks (CJK Radicals Supplement, Kangxi Radicals).
  return RADICAL_FORMS.has(chars[0]) || (cp >= 0x2e80 && cp <= 0x2fdf);
}

// ---------- Visual similarity ----------

/** Classic look-alikes that are easy to mix up when learned together. */
const CONFUSABLE_GROUPS = ['未末', '己已巳', '人入八', '土士', '日曰', '大太犬', '目自', '干千于', '天夫', '午牛', '王玉主', '木本术', '白百', '刀力', '儿几', '贝见', '问间', '休体', '找我', '热熟'];
const CONFUSABLE = new Map<string, Set<string>>();
for (const group of CONFUSABLE_GROUPS) {
  for (const c of group) CONFUSABLE.set(c, new Set([...(CONFUSABLE.get(c) ?? []), ...[...group].filter((x) => x !== c)]));
}

const isIdc = (c: string | undefined) => !!c && c.codePointAt(0)! >= 0x2ff0 && c.codePointAt(0)! <= 0x2ffb;

function charsSimilar(a: string, b: string, dict: HanziDict | null): boolean {
  if (a === b) return false;
  if (CONFUSABLE.get(a)?.has(b)) return true;
  const ea = dict?.[a];
  const eb = dict?.[b];
  if (!ea || !eb) return false;
  // Same radical in the same layout, e.g. 妈 / 她 / 好 (女 on the left).
  return ea[3] === eb[3] && isIdc(ea[2][0]) && ea[2][0] === eb[2][0];
}

export function wordsSimilar(a: Word, b: Word, dict: HanziDict | null): boolean {
  const cb = writableChars(b.hanzi);
  return writableChars(a.hanzi).some((x) => cb.some((y) => charsSimilar(x, y, dict)));
}

// ---------- Order & batches ----------

export interface LearnPlan {
  /** Teaching order: prerequisites first, otherwise the order the words were added. */
  ordered: Word[];
  /** Word id → ids of words (in this plan) that should be learned before it. */
  deps: Map<string, Set<string>>;
}

/**
 * Order new words so that parts come before wholes: a character before words that contain it
 * (学 before 学生), and — with Make Me a Hanzi data — components before characters built from
 * them (女 before 好). Without the data, words tagged "key" go first. Ties keep the order the
 * words were added.
 */
export function planLearning(words: Word[], dict: HanziDict | null): LearnPlan {
  const isKey = (w: Word) => w.tags.some((t) => t.toLowerCase() === 'key');
  const base = [...words].sort((a, b) => (dict ? 0 : Number(isKey(b)) - Number(isKey(a))) || a.createdAt - b.createdAt);
  const singleChar = new Map<string, Word>();
  for (const w of base) if ([...w.hanzi.trim()].length === 1 && !singleChar.has(w.hanzi.trim())) singleChar.set(w.hanzi.trim(), w);

  const deps = new Map<string, Set<string>>();
  for (const w of base) {
    const d = new Set<string>();
    for (const c of writableChars(w.hanzi)) {
      const own = singleChar.get(c);
      if (own && own.id !== w.id) d.add(own.id);
      if (dict) {
        for (const comp of deepComponents(dict, c)) {
          const u = singleChar.get(comp);
          if (u && u.id !== w.id) d.add(u.id);
        }
      }
    }
    deps.set(w.id, d);
  }

  // Follow the added order, pulling each word's prerequisites in just before it
  // (子, 女 right before 好), so lesson order is kept as much as possible.
  const byId = new Map(base.map((w) => [w.id, w]));
  const rank = new Map(base.map((w, i) => [w.id, i]));
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const ordered: Word[] = [];
  const place = (w: Word) => {
    if (placed.has(w.id) || visiting.has(w.id)) return; // visiting: a cycle, just skip the edge
    visiting.add(w.id);
    const pre = [...deps.get(w.id)!].map((id) => byId.get(id)!).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    for (const p of pre) place(p);
    visiting.delete(w.id);
    placed.add(w.id);
    ordered.push(w);
  };
  for (const w of base) place(w);
  return { ordered, deps };
}

/**
 * The next batch from the words not learned yet (`remaining`, in plan order). Look-alikes are
 * kept out of the same batch when possible (along with anything that depends on a skipped word);
 * if that would leave the batch short, the skipped words fill it anyway.
 */
export function nextBatch(plan: LearnPlan, remaining: Set<string>, size: number, dict: HanziDict | null): Word[] {
  const batch: Word[] = [];
  const deferred: Word[] = [];
  for (const w of plan.ordered) {
    if (batch.length >= size) break;
    if (!remaining.has(w.id)) continue;
    const deps = plan.deps.get(w.id)!;
    const blocked = deferred.some((d) => deps.has(d.id));
    if (blocked || batch.some((b) => wordsSimilar(b, w, dict))) deferred.push(w);
    else batch.push(w);
  }
  for (const w of deferred) {
    if (batch.length >= size) break;
    batch.push(w);
  }
  // Teach in plan order, so components come first within the batch too.
  const rank = new Map(plan.ordered.map((w, i) => [w.id, i]));
  return batch.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
}

// ---------- Learned state ----------

/** SM-2 state for a word just learned in Learn mode: first review tomorrow. */
export function learnedSrs(on: string = today()): SrsState {
  return { ease: 2.5, interval: 1, reps: 1, lapses: 0, successes: 0, due: addDays(on, 1), lastReviewed: on, learnedOn: on };
}

export const learnedToday = (words: Word[], on: string = today()) => words.filter((w) => w.srs.learnedOn === on).length;
