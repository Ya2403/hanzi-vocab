import { isLearned, SKILL_LABEL } from '../lib/srs';
import type { Sentence, Skill, Word } from '../lib/types';
import { useStore } from '../store';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { toPinyin } from '../lib/pinyin';
import { tatoebaUrl } from '../lib/tatoeba';
import { SpeakButton } from './SpeakButton';
import { FillTranslations } from './SentenceBulk';

/**
 * Example sentence with its pinyin and English translation. When `pinyinVisible` is false the
 * pinyin is hidden, and tapping the sentence reveals it for this card. A sentence without a
 * translation shows a "needs translation" label that opens "Fill missing translations".
 */
export function ExampleSentence({
  text,
  pinyinVisible,
  translation,
  tatoebaId,
  pinyin,
}: {
  text: string;
  /** The sentence's own pinyin (else generated). */
  pinyin?: string;
  pinyinVisible: boolean;
  translation?: string;
  /** Tatoeba sentence id: shown as a small attribution link. */
  tatoebaId?: number;
}) {
  const [revealed, setRevealed] = useState(false);
  const [filling, setFilling] = useState(false);
  const show = pinyinVisible || revealed;
  const reveal = (e: MouseEvent) => {
    e.stopPropagation(); // don't flip or select the card underneath
    setRevealed(true);
  };
  return (
    <div className="answer-example">
      <div lang="zh-CN" className={show ? undefined : 'can-reveal'} onClick={show ? undefined : reveal} title={show ? undefined : 'Tap to show pinyin'}>
        {text} <SpeakButton text={text} size={16} label="Play example" />
      </div>
      {show ? <div className="muted small">{pinyin || toPinyin(text)}</div> : <div className="reveal-hint">tap the sentence for pinyin</div>}
      {translation ? (
        <div className="small example-translation">{translation}</div>
      ) : (
        <NeedsTranslationButton onOpen={() => setFilling(true)} />
      )}
      {tatoebaId ? <TatoebaCredit id={tatoebaId} /> : null}
      {filling && (
        <StopClicks>
          <FillTranslations onClose={() => setFilling(false)} />
        </StopClicks>
      )}
    </div>
  );
}

/** Clicks inside a modal still bubble through the React tree (portals): keep them from cards and rows. */
export function StopClicks({ children }: { children: ReactNode }) {
  return <span onClick={(e) => e.stopPropagation()}>{children}</span>;
}

/** "needs translation": tapping it opens the "Fill missing translations" flow. */
export function NeedsTranslationButton({ onOpen }: { onOpen(): void }) {
  return (
    <button
      type="button"
      className="status needs needs-btn"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title="Fill in missing translations"
    >
      needs translation
    </button>
  );
}

/**
 * Sentences a word appears in, best example first: ones linked to it by hand, then ones with a
 * translation, then ones whose other words are learned, then the shortest.
 */
export function useWordSentences(word: Word): Sentence[] {
  const { links } = useStore();
  const list = links.byWord.get(word.id) ?? [];
  const pinned = (s: Sentence) => (s.wordIds?.includes(word.id) ? 0 : 1);
  const untranslated = (s: Sentence) => (s.translation.trim() ? 0 : 1);
  const unknownShare = (s: Sentence) => {
    const others = (links.bySentence.get(s.id) ?? []).filter((w) => w.id !== word.id);
    return others.length ? others.filter((w) => !isLearned(w)).length / others.length : 0;
  };
  return [...list].sort(
    (a, b) => pinned(a) - pinned(b) || untranslated(a) - untranslated(b) || unknownShare(a) - unknownShare(b) || a.zh.length - b.zh.length,
  );
}

/** A word's example sentences (its linked Sentences), with translations when they have one. */
export function WordExamples({ word, pinyinVisible, max = 1 }: { word: Word; pinyinVisible: boolean; max?: number }) {
  const list = useWordSentences(word).slice(0, max);
  return (
    <>
      {list.map((s) => (
        <ExampleSentence key={s.id} text={s.zh} pinyin={s.pinyin} pinyinVisible={pinyinVisible} translation={s.translation || undefined} tatoebaId={s.tatoebaId} />
      ))}
    </>
  );
}

/** CC BY attribution for a Tatoeba sentence: links to the sentence page (authors are listed there). */
export function TatoebaCredit({ id }: { id: number }) {
  return (
    <a className="tatoeba-credit" href={tatoebaUrl(id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      Tatoeba #{id} · CC BY 2.0 FR
    </a>
  );
}

export function NotesBox({ notes }: { notes?: string }) {
  if (!notes) return null;
  return (
    <div className="notes-box">
      <span aria-hidden="true">💡</span>
      <span>{notes}</span>
    </div>
  );
}

/** 🐛 badge; with `skills`, names the skills that became leeches (e.g. "🐛 pinyin"). */
export function LeechBadge({ skills }: { skills?: Skill[] }) {
  const which = skills?.length ? skills.map((k) => SKILL_LABEL[k].toLowerCase()).join(", ") : "leech";
  return (
    <span className="status leech" title={`Leech: missed many times${skills?.length ? ` (${which})` : ""}`}>
      🐛 {which}
    </span>
  );
}
