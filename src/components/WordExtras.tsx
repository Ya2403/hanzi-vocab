import { SKILL_LABEL } from '../lib/srs';
import type { Sentence, Skill, Word } from '../lib/types';
import { useStore } from '../store';
import { useState, type MouseEvent } from 'react';
import { toPinyin } from '../lib/pinyin';
import { tatoebaUrl } from '../lib/tatoeba';
import { SpeakButton } from './SpeakButton';

/**
 * Example sentence with its pinyin. When `pinyinVisible` is false the pinyin is hidden,
 * and tapping the sentence reveals it for this card.
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
      {translation && <div className="small example-translation">{translation}</div>}
      {tatoebaId ? <TatoebaCredit id={tatoebaId} /> : null}
    </div>
  );
}

/** Sentences a word appears in: ones linked to it by hand first, then the shortest. */
export function useWordSentences(word: Word): Sentence[] {
  const { links } = useStore();
  const list = links.byWord.get(word.id) ?? [];
  const pinned = (s: Sentence) => (s.wordIds?.includes(word.id) ? 0 : 1);
  return [...list].sort((a, b) => pinned(a) - pinned(b) || a.zh.length - b.zh.length);
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
