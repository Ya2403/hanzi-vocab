import { useState } from 'react';
import { useStore } from '../store';
import { formatDate, toDateStr } from '../lib/date';
import { entryChars, lockingChars, missingChars, needsWork, wordAccuracy, type CharSlot } from '../lib/entries';
import { loadHanziDict, missingCharInputs } from '../lib/hanziDict';
import { isLearned } from '../lib/srs';
import type { Word } from '../lib/types';
import { HanziText } from './HanziText';
import { SpeakButton } from './SpeakButton';

/** A word's characters with the locking ones (not in the list, or not learned yet) underlined. */
export function LockedHanzi({ word, slots }: { word: Word; slots: CharSlot[] }) {
  const locking = new Set(lockingChars(slots));
  if (!locking.size) return <HanziText text={word.hanzi} />;
  return (
    <>
      {[...word.hanzi].map((c, i) =>
        c === '…' ? (
          <HanziText key={i} text="…" />
        ) : (
          <span key={i} className={locking.has(c) ? 'locking-char' : undefined}>
            {c}
          </span>
        ),
      )}
    </>
  );
}

/**
 * "Used in": my words that contain a character (hanzi, pinyin, meaning, audio). Locked ones are
 * greyed out, with the missing character underlined.
 */
export function UsedIn({ char, onOpen, max }: { char: Word; onOpen?(w: Word): void; max?: number }) {
  const { charLinks } = useStore();
  const all = charLinks.usedIn.get(char.id) ?? [];
  if (!all.length) return null;
  // Unlocked words first, then by length.
  const list = [...all].sort((a, b) => Number(isLearned(b)) - Number(isLearned(a)) || a.hanzi.length - b.hanzi.length).slice(0, max ?? all.length);
  return (
    <div className="used-in">
      <div className="field-label">Used in</div>
      <ul>
        {list.map((w) => {
          const locked = !isLearned(w);
          return (
            <li key={w.id} className={locked ? 'locked' : undefined}>
              <button type="button" className="used-in-word" onClick={onOpen ? () => onOpen(w) : undefined} disabled={!onOpen}>
                <span className="hanzi" lang="zh-CN">
                  <LockedHanzi word={w} slots={charLinks.charsOf.get(w.id) ?? []} />
                </span>
                <span className="pinyin">{w.pinyin}</span>
                <span className="meaning">{w.meaning}</span>
                {locked && <span className="lock" aria-label="locked">🔒</span>}
              </button>
              <SpeakButton text={w.hanzi} size={16} />
            </li>
          );
        })}
      </ul>
      {all.length > list.length && <p className="muted small">…and {all.length - list.length} more</p>}
    </div>
  );
}

/** "电脑 = 电 electricity + 脑 brain": a word's characters as tappable chips. */
export function CharFormula({ word, onOpen }: { word: Word; onOpen?(w: Word): void }) {
  const { charLinks } = useStore();
  const slots: CharSlot[] = charLinks.charsOf.get(word.id) ?? entryChars(word.hanzi).map((char) => ({ char }));
  return (
    <div className="char-formula" lang="zh-CN">
      <span className="formula-word">
        <HanziText text={word.hanzi} />
      </span>
      <span className="muted">=</span>
      {slots.map((s, i) => (
        <span key={s.char} className="formula-part">
          {i > 0 && <span className="muted">+</span>}
          {s.entry ? (
            <button
              type="button"
              className={`word-chip ${isLearned(s.entry) ? '' : 'not-learned'}`}
              onClick={onOpen ? () => onOpen(s.entry!) : undefined}
              title={isLearned(s.entry) ? s.entry.pinyin : 'not learned yet'}
            >
              {s.char} <small className="muted">{s.entry.meaning}</small>
            </button>
          ) : (
            <span className="word-chip static missing" title="not in your list">
              {s.char} <small>not in your list</small>
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/** "Add missing characters": characters of these words that aren't in the list become entries. */
export function AddMissingChars({ words, label }: { words: Word[]; label?: string }) {
  const { charLinks, addWords } = useStore();
  const [busy, setBusy] = useState(false);
  const missing = words.flatMap((w) => missingChars(charLinks.charsOf.get(w.id) ?? []).map((char) => ({ char, from: w.hanzi, tags: w.tags })));
  const chars = [...new Set(missing.map((m) => m.char))];
  if (!chars.length) return null;
  const add = async () => {
    setBusy(true);
    const dict = await loadHanziDict().catch(() => null);
    await addWords(missingCharInputs(missing, dict));
    setBusy(false);
  };
  return (
    <button type="button" className="btn small-btn" onClick={add} disabled={busy}>
      {label ?? 'Add missing characters'}: <span lang="zh-CN">{chars.join(' ')}</span>
    </button>
  );
}

/** Locked / unlocked, and what it's waiting for. */
export function LockState({ word }: { word: Word }) {
  const { charLinks } = useStore();
  const slots = charLinks.charsOf.get(word.id) ?? [];
  const missing = missingChars(slots);
  const notLearned = lockingChars(slots).filter((c) => !missing.includes(c));
  if (isLearned(word))
    return (
      <p className="lock-state unlocked small">
        🔓 Unlocked{word.unlockedOn ? ` on ${formatDate(word.unlockedOn)}` : ''}: it comes up in exercises.
      </p>
    );
  return (
    <div className="lock-state locked small">
      <p>
        🔒 Locked
        {notLearned.length > 0 && (
          <>
            : learn <span lang="zh-CN">{notLearned.join(' ')}</span> first
          </>
        )}
        {missing.length > 0 && (
          <>
            {notLearned.length ? '; ' : ': '}
            <span lang="zh-CN">{missing.join(' ')}</span> {missing.length === 1 ? 'isn’t' : 'aren’t'} in your list
          </>
        )}
        .
      </p>
      <AddMissingChars words={[word]} />
    </div>
  );
}

/** A word's background statistics: accuracy, last 5 results, last seen, "needs work". */
export function WordStatsBox({ word }: { word: Word }) {
  const s = word.stats;
  const acc = wordAccuracy(word);
  return (
    <div className="word-stats small">
      {needsWork(word) && <span className="status needs-work">needs work</span>}
      {s?.answered ? (
        <>
          <span>
            {Math.round((acc ?? 0) * 100)}% right ({s.correct}/{s.answered})
          </span>
          {s.recent && (
            <span className="recent-dots" aria-label={`last results ${s.recent}`}>
              {[...s.recent].map((r, i) => (
                <span key={i} className={r === '1' ? 'dot ok' : 'dot bad'} />
              ))}
            </span>
          )}
          {s.lastSeen && <span className="muted">seen {formatDate(toDateStr(new Date(s.lastSeen)))}</span>}
        </>
      ) : (
        <span className="muted">Not practised yet.</span>
      )}
    </div>
  );
}
