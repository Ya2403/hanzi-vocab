import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { isWordEntry } from '../lib/entries';
import { describe as describeChar, useHanziDict } from '../lib/hanziDict';
import { englishTokens } from '../lib/hints';
import { toPinyin } from '../lib/pinyin';
import { isQuiet } from '../lib/quiet';
import { tokenize, type Token } from '../lib/reader';
import { getSettings } from '../lib/settings';
import { speak } from '../lib/speech';
import { isLearned } from '../lib/srs';
import { writableChars } from '../lib/strokes';
import type { Sentence, Word } from '../lib/types';
import { CharFormula } from './Entries';
import { HanziText } from './HanziText';
import { Icon } from './Icon';
import { SpeakButton } from './SpeakButton';

/**
 * Hints in an exercise: whether words can be tapped, and what a tap on a learned item does (a
 * lookup). One scope per exercise, so only the first tap on each item counts.
 */
export interface HintScope {
  enabled: boolean;
  /** A learned item was looked up (called once per item per exercise). */
  onLookup(item: Word): void;
}

const HintContext = createContext<HintScope>({ enabled: false, onLookup: () => {} });

/** Wrap one exercise: `enabled` (the setting, and not a "No hints" exercise) and the lookup handler. */
export function HintProvider({ enabled, onLookup, children }: { enabled: boolean; onLookup(item: Word): void; children: ReactNode }) {
  const counted = useMemo(() => new Set<string>(), []);
  const value = useMemo<HintScope>(
    () => ({
      enabled,
      onLookup: (item) => {
        if (counted.has(item.id) || !isLearned(item)) return;
        counted.add(item.id);
        onLookup(item);
      },
    }),
    [enabled, onLookup, counted],
  );
  return <HintContext.Provider value={value}>{children}</HintContext.Provider>;
}

export const useHints = () => useContext(HintContext);

type Open = { kind: 'zh'; text: string; word?: Word } | { kind: 'en'; text: string; zh?: string; word?: Word };

/** The popup for a tapped word: the Chinese, pinyin, meaning, audio and character chips (or "No hint"). */
function HintPopup({ open, onClose }: { open: Open; onClose(): void }) {
  const { words } = useStore();
  const zh = open.kind === 'zh' ? open.text : open.zh;
  const word = open.word ?? (zh ? words.find((w) => w.hanzi.trim() === zh) : undefined);
  const { dict } = useHanziDict(!!zh && !word);
  useEffect(() => {
    if (zh && !isQuiet() && getSettings().autoPlay) speak(zh);
  }, [zh]);
  const meaning =
    word?.meaning ??
    (zh && dict
      ? writableChars(zh)
          .map((c) => {
            const d = describeChar(dict, c)?.definition;
            return d ? `${c}: ${d}` : '';
          })
          .filter(Boolean)
          .join(' · ') || 'Not in your list.'
      : undefined);
  return (
    <div className="hint-popup card" role="dialog" aria-label="Hint">
      <button className="icon-btn popup-close" onClick={onClose} aria-label="Close">
        <Icon name="close" size={18} />
      </button>
      {open.kind === 'en' && <div className="muted small">“{open.text}”</div>}
      {zh ? (
        <>
          <div className="popup-head">
            <span className="popup-hanzi" lang="zh-CN">
              <HanziText text={zh} />
            </span>
            <span className="pinyin">{word?.pinyin ?? toPinyin(zh)}</span>
            <SpeakButton text={zh} size={18} />
          </div>
          {meaning && <div className="popup-meaning">{meaning}</div>}
          {word && isWordEntry(word) && <CharFormula word={word} />}
        </>
      ) : (
        <div className="popup-meaning muted">No hint for this word.</div>
      )}
    </div>
  );
}

/**
 * Chinese in a prompt: each word (not the tested items in `exclude`) can be tapped for a hint,
 * with a dotted underline. A tap on a learned item counts as a lookup.
 */
export function HintZh({ text, exclude = [], className = '' }: { text: string; exclude?: Word[]; className?: string }) {
  const { words } = useStore();
  const hints = useHints();
  const [open, setOpen] = useState<Open | null>(null);
  const byHanzi = useMemo(() => new Map(words.map((w) => [w.hanzi.trim(), w])), [words]);
  const tokens = useMemo(() => tokenize(text, byHanzi), [text, byHanzi]);
  if (!hints.enabled) return <span className={className}>{text}</span>;
  const excluded = (t: Token) =>
    exclude.some((x) => t.word?.id === x.id || x.hanzi.includes(t.text) || t.text.includes(x.hanzi.trim()));
  return (
    <span className={`hint-text ${className}`} lang="zh-CN">
      {tokens.map((t, i) =>
        t.kind === 'other' || excluded(t) ? (
          <span key={i}>{t.text}</span>
        ) : (
          <button
            key={i}
            type="button"
            className={`hint-word ${open?.text === t.text ? 'open' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen({ kind: 'zh', text: t.text, word: t.word });
              if (t.word) hints.onLookup(t.word);
            }}
          >
            {t.text}
          </button>
        ),
      )}
      {open && <HintPopup open={open} onClose={() => setOpen(null)} />}
    </span>
  );
}

/**
 * English in a prompt: each word can be tapped to see the Chinese it stands for in this sentence
 * (stored alignments, else the meanings of the sentence's items). Words that stand for a tested
 * item (`exclude`) aren't tappable.
 */
export function HintEn({ text, sentence, exclude = [], className = '' }: { text: string; sentence?: Sentence; exclude?: Word[]; className?: string }) {
  const { links } = useStore();
  const hints = useHints();
  const [open, setOpen] = useState<Open | null>(null);
  const items = sentence ? (links.bySentence.get(sentence.id) ?? []) : [];
  const tokens = useMemo(() => englishTokens(text, sentence, items), [text, sentence, items]);
  if (!hints.enabled) return <span className={className}>{text}</span>;
  const excluded = (zh?: string, item?: Word) =>
    exclude.some((x) => (item && x.id === item.id) || (zh && (zh.includes(x.hanzi.trim()) || x.hanzi.includes(zh))));
  return (
    <span className={`hint-text ${className}`}>
      {tokens.map((t, i) =>
        !t.word || excluded(t.zh, t.item) ? (
          <span key={i}>{t.text}</span>
        ) : (
          <button
            key={i}
            type="button"
            className={`hint-word en ${open?.text === t.text ? 'open' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen({ kind: 'en', text: t.text, zh: t.zh, word: t.item });
              if (t.item) hints.onLookup(t.item);
            }}
          >
            {t.text}
          </button>
        ),
      )}
      {open && <HintPopup open={open} onClose={() => setOpen(null)} />}
    </span>
  );
}

/** The small label on an exercise without hints. */
export function NoHintsLabel() {
  return <span className="no-hints">No hints</span>;
}
