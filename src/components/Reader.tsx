import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { fsrsReview } from '../lib/fsrs';
import { describe as describeChar, useHanziDict } from '../lib/hanziDict';
import { toPinyin } from '../lib/pinyin';
import { isQuiet, useQuiet } from '../lib/quiet';
import { finishPlan, knownPercent, tokenize, type Token } from '../lib/reader';
import { getSettings, updateSettings, useSettings } from '../lib/settings';
import { speak, speakAll, speechSupported, stopSpeaking } from '../lib/speech';
import { Grade, recordAnswer, reviewWithLeech, skillState, withSkill } from '../lib/srs';
import { writableChars } from '../lib/strokes';
import type { Dialogue, Sentence, Word } from '../lib/types';
import { Icon } from './Icon';
import { QuietBadge } from './QuietBadge';
import { Session } from './Session';
import { WordDetail } from './WordDetail';
import { WordForm } from './WordForm';

export interface ReaderText {
  /** "d:<dialogue id>" or "t:<tag>" (for remembering when it was last read). */
  key: string;
  title: string;
  lines: { sentence: Sentence; speaker?: string }[];
  dialogueId?: string;
}

export interface ReadingResult {
  reviewed: number;
  lookedUp: Word[];
}

/** A dialogue (or daily reading) as a text for the reader. */
export function dialogueText(d: Dialogue, sentences: Sentence[]): ReaderText {
  const byId = new Map(sentences.map((s) => [s.id, s]));
  return {
    key: `d:${d.id}`,
    title: d.title,
    dialogueId: d.id,
    lines: d.lines.flatMap((l) => {
      const sentence = byId.get(l.sentenceId);
      return sentence ? [{ sentence, speaker: l.speaker }] : [];
    }),
  };
}

const RATES = [0.6, 0.8, 1] as const;
const LAST_READ_KEY = 'hanzi-vocab:lastRead';

/** When a text was last read (dialogues keep it on the dialogue, so it syncs; tag groups per device). */
export function lastReadOf(key: string): number | undefined {
  try {
    return (JSON.parse(localStorage.getItem(LAST_READ_KEY) ?? '{}') as Record<string, number>)[key];
  } catch {
    return undefined;
  }
}
function saveLastRead(key: string, at: number) {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_READ_KEY) ?? '{}') as Record<string, number>;
    localStorage.setItem(LAST_READ_KEY, JSON.stringify({ ...all, [key]: at }));
  } catch {
    /* best effort */
  }
}

/**
 * Read a text (a dialogue, a tag's sentences, a daily reading). Words are tappable: a learned
 * word you look up counts as a miss on its meaning (once per reading). "Done reading" reviews
 * the learned words you read without looking up.
 */
export function Reader({ text, onClose, onFinished, onEdit }: { text: ReaderText; onClose(): void; onFinished?(r: ReadingResult): void; onEdit?(): void }) {
  const { words, dialogues, updateWord, updateWords, updateDialogue } = useStore();
  const { showPinyin, readerRate, leechThreshold } = useSettings();
  const quiet = useQuiet();
  const [pinyinOn, setPinyinOn] = useState(showPinyin);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [popup, setPopup] = useState<Token | null>(null);
  const [lookedUp, setLookedUp] = useState<Map<string, Word>>(new Map());
  const [playing, setPlaying] = useState(false);
  const [practice, setPractice] = useState<Word[] | null>(null);
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [adding, setAdding] = useState<Token | null>(null);
  const [detail, setDetail] = useState<Word | null>(null);

  // Full screen; again after a practice session from the summary closes (it clears the class).
  useEffect(() => {
    document.body.classList.add('in-session');
    return () => document.body.classList.remove('in-session');
  }, [practice]);
  useEffect(() => () => stopSpeaking(), []);

  const byHanzi = useMemo(() => new Map(words.map((w) => [w.hanzi.trim(), w])), [words]);
  const lines = useMemo(() => text.lines.map((l) => ({ ...l, tokens: tokenize(l.sentence.zh, byHanzi) })), [text, byHanzi]);
  const allTokens = lines.flatMap((l) => l.tokens);
  const known = knownPercent(allTokens);
  const audio = speechSupported && !quiet;

  /** A learned word looked up for the first time in this reading: a miss on its meaning. */
  const lookUp = (t: Token) => {
    setPopup(t);
    const w = t.word && words.find((x) => x.id === t.word!.id);
    if (!w || t.kind !== 'learned' || lookedUp.has(w.id)) return;
    setLookedUp((m) => new Map(m).set(w.id, w));
    const st = recordAnswer(reviewWithLeech(skillState(w, 'meaning'), Grade.Again, leechThreshold).srs, false);
    updateWord(withSkill(w, 'meaning', st)).catch((e) => console.error('Failed to save lookup', e));
  };

  const playAll = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    speakAll(
      text.lines.map((l) => l.sentence.zh),
      () => setPlaying(false),
      readerRate,
    );
  };

  const finish = async () => {
    stopSpeaking();
    setPopup(null);
    const now = Date.now();
    // Use the stored words (lookups above changed some).
    const fresh = allTokens.map((t) => (t.word ? { ...t, word: words.find((x) => x.id === t.word!.id) ?? t.word } : t));
    const plan = finishPlan(fresh, new Set(lookedUp.keys()), now);
    const updated = [
      ...plan.review.map((w) => withSkill(w, 'meaning', recordAnswer(fsrsReview(skillState(w, 'meaning'), Grade.Good, now), true, now))),
      ...plan.seen.map((w) => withSkill(w, 'meaning', recordAnswer(skillState(w, 'meaning'), true, now))),
    ];
    if (updated.length) await updateWords(updated);
    const d = text.dialogueId && dialogues.find((x) => x.id === text.dialogueId);
    if (d) await updateDialogue({ ...d, lastRead: now });
    else saveLastRead(text.key, now);
    const r = { reviewed: plan.review.length + plan.seen.length, lookedUp: [...lookedUp.values()] };
    setResult(r);
    onFinished?.(r);
  };

  if (practice) {
    return <Session title="Looked-up words" words={practice} mode="auto" direction="mixed" onExit={() => setPractice(null)} />;
  }

  const modals = (
    <>
      {popup && <WordPopup token={popup} counted={!!popup.word && lookedUp.has(popup.word.id)} rate={readerRate} audio={audio} onAdd={() => setAdding(popup)} onOpen={(w) => setDetail(w)} onClose={() => setPopup(null)} />}
      {adding && <WordForm initial={{ hanzi: adding.text, pinyin: toPinyin(adding.text), meaning: '' }} onClose={() => setAdding(null)} />}
      {detail && <WordDetail word={detail} onClose={() => setDetail(null)} onEdit={() => setDetail(null)} />}
    </>
  );

  if (result) {
    return (
      <div className="summary card reader-summary">
        <div className="summary-score">📖</div>
        <h2>Reading done</h2>
        <p className="muted">
          {result.reviewed} word{result.reviewed === 1 ? '' : 's'} reviewed · {result.lookedUp.length} looked up
        </p>
        {result.lookedUp.length > 0 && (
          <>
            <h3>Looked up</h3>
            <div className="word-chips center">
              {result.lookedUp.map((w) => (
                <button key={w.id} type="button" className="word-chip" lang="zh-CN" onClick={() => setDetail(words.find((x) => x.id === w.id) ?? w)}>
                  {w.hanzi} <small className="muted">{w.meaning}</small>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="row center">
          {result.lookedUp.length > 0 && (
            <button className="btn" onClick={() => setPractice(result.lookedUp.map((w) => words.find((x) => x.id === w.id) ?? w))}>
              Practice looked-up words
            </button>
          )}
          <button className="btn primary" onClick={onClose} autoFocus>
            Done
          </button>
        </div>
        {modals}
      </div>
    );
  }

  return (
    <div className="session reader">
      <div className="session-bar">
        <button className="icon-btn" onClick={onClose} aria-label="Close reader" title="Close">
          <Icon name="close" />
        </button>
        <span className="reader-title" lang="zh-CN">
          {text.title}
        </span>
        <span className={`known-badge ${known >= 90 ? 'high' : known >= 70 ? 'mid' : 'low'}`} title="Learned words ÷ all words in the text">
          {known}% known
        </span>
        <button className={`pinyin-toggle ${pinyinOn ? 'on' : ''}`} onClick={() => setPinyinOn((p) => !p)} aria-pressed={pinyinOn} title="Pinyin">
          拼音
        </button>
        <QuietBadge />
      </div>

      <div className="reader-controls row">
        {speechSupported && (
          <>
            <button className="btn small-btn" onClick={playAll} disabled={!audio}>
              <Icon name="speaker" size={16} /> {playing ? 'Stop' : 'Play all'}
            </button>
            <div className="speed" role="radiogroup" aria-label="Speed">
              {RATES.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={readerRate === r} className={readerRate === r ? 'active' : ''} onClick={() => updateSettings({ readerRate: r })}>
                  {r}×
                </button>
              ))}
            </div>
          </>
        )}
        {onEdit && (
          <button className="btn small-btn ghost" onClick={onEdit}>
            <Icon name="edit" size={16} /> Edit
          </button>
        )}
      </div>
      {speechSupported && quiet && <p className="hint">Listening is paused (Can’t listen now). Tap the headphones icon to turn it back on.</p>}

      <ol className="reader-lines">
        {lines.map(({ sentence: s, speaker, tokens }) => (
          <li key={s.id} className="reader-line">
            {speaker && <span className="speaker">{speaker}</span>}
            <div className="reader-line-body">
              <div className="reader-text" lang="zh-CN">
                {tokens.map((t, i) =>
                  t.kind === 'other' ? (
                    <span key={i}>{t.text}</span>
                  ) : (
                    <button key={i} type="button" className={`rt ${t.kind} ${popup === t ? 'open' : ''}`} onClick={() => lookUp(t)}>
                      {pinyinOn || t.kind === 'new' ? (
                        <ruby>
                          {t.text}
                          <rt>{t.word?.pinyin ?? toPinyin(t.text)}</rt>
                        </ruby>
                      ) : (
                        t.text
                      )}
                    </button>
                  ),
                )}
              </div>
              {shown.has(s.id) && <div className="reader-translation">{s.translation || <span className="muted">No translation yet.</span>}</div>}
            </div>
            <div className="reader-line-actions">
              {speechSupported && (
                <button className="icon-btn" onClick={() => speak(s.zh, readerRate)} disabled={!audio} aria-label="Play line" title="Play">
                  <Icon name="speaker" size={18} />
                </button>
              )}
              <button
                className={`icon-btn translate-btn ${shown.has(s.id) ? 'on' : ''}`}
                onClick={() =>
                  setShown((x) => {
                    const n = new Set(x);
                    if (n.has(s.id)) n.delete(s.id);
                    else n.add(s.id);
                    return n;
                  })
                }
                aria-label="Show translation"
                title="Translation"
              >
                译
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button className="btn primary block reader-done" onClick={finish}>
        Done reading
      </button>
      <p className="muted small center">
        Tapping a word you’ve learned counts as looking it up. When you’re done, the words you read without looking up are reviewed.
      </p>
      {modals}
    </div>
  );
}

/** The popup for a tapped word: hanzi, pinyin, meaning, audio, and add / open. */
function WordPopup({
  token: t,
  counted,
  rate,
  audio,
  onAdd,
  onOpen,
  onClose,
}: {
  token: Token;
  counted: boolean;
  rate: number;
  audio: boolean;
  onAdd(): void;
  onOpen(w: Word): void;
  onClose(): void;
}) {
  const { words } = useStore();
  const { dict } = useHanziDict(!t.word);
  const w = t.word && (words.find((x) => x.id === t.word!.id) ?? t.word);
  const meaning = w
    ? w.meaning
    : dict
      ? writableChars(t.text)
          .map((c) => {
            const d = describeChar(dict, c)?.definition;
            return d ? `${c}: ${d}` : '';
          })
          .filter(Boolean)
          .join(' · ') || 'Not in the dictionary.'
      : 'Not in your list.';
  useEffect(() => {
    if (audio && !isQuiet() && getSettings().autoPlay) speak(t.text, rate);
  }, [t]);

  return (
    <div className="reader-popup card" role="dialog" aria-label={`Word ${t.text}`}>
      <button className="icon-btn popup-close" onClick={onClose} aria-label="Close">
        <Icon name="close" size={18} />
      </button>
      <div className="popup-head">
        <span className="popup-hanzi" lang="zh-CN">
          {t.text}
        </span>
        <span className="pinyin">{w?.pinyin ?? toPinyin(t.text)}</span>
        {audio && (
          <button className="icon-btn" onClick={() => speak(t.text, rate)} aria-label="Play word">
            <Icon name="speaker" size={18} />
          </button>
        )}
      </div>
      <div className="popup-meaning">{meaning}</div>
      <div className="muted small">
        {t.kind === 'learned' ? (counted ? 'Counted as a lookup (meaning: again).' : '') : t.kind === 'new' ? 'In your list, not learned yet.' : 'Not in your list.'}
      </div>
      <div className="row">
        {w ? (
          <button className="btn small-btn" onClick={() => onOpen(w)}>
            Open word
          </button>
        ) : (
          <button className="btn small-btn primary" onClick={onAdd}>
            Add to my words
          </button>
        )}
      </div>
    </div>
  );
}
