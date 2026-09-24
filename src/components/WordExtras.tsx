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
}: {
  text: string;
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
      {show ? <div className="muted small">{toPinyin(text)}</div> : <div className="reveal-hint">tap the sentence for pinyin</div>}
      {translation && <div className="small example-translation">{translation}</div>}
      {tatoebaId ? <TatoebaCredit id={tatoebaId} /> : null}
    </div>
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

export function LeechBadge() {
  return (
    <span className="status leech" title="Leech: missed many times">
      🐛 leech
    </span>
  );
}
