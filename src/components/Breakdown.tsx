import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { describe, gloss, useHanziDict, wordsContaining, type CharInfo, type Etymology, type HanziDict } from '../lib/hanziDict';
import { updateSettings, useSettings } from '../lib/settings';
import { writableChars } from '../lib/strokes';
import type { Word } from '../lib/types';
import { Modal } from './Modal';

interface Props {
  word: Word;
  /** When given, words in the "Words with X" list are tappable (word detail view). */
  onOpenWord?(word: Word): void;
  /** Render as a <details> that loads data only when expanded (flashcard backs). */
  collapsible?: boolean;
  /** False hides every reading in the breakdown (follows the pinyin visibility setting). */
  pinyinVisible?: boolean;
}

export function Breakdown({ word, onOpenWord, collapsible, pinyinVisible = true }: Props) {
  const cls = `breakdown${pinyinVisible ? '' : ' hide-pinyin'}`;
  const { breakdownOpen } = useSettings();
  const open = !collapsible || breakdownOpen;
  const { status, dict, retry } = useHanziDict(open);
  const [picked, setPicked] = useState<string | null>(null);
  const chars = [...new Set(writableChars(word.hanzi))];
  if (!chars.length) return null;

  const body =
    status === 'ready' && dict ? (
      chars.map((c) => <CharBreakdown key={c} char={c} info={describe(dict, c)} onPick={setPicked} />)
    ) : status === 'error' ? (
      <div className="breakdown-error">
        <p className="hint">Character breakdowns need a one-time download (about 280 KB). You seem to be offline.</p>
        <button type="button" className="btn small-btn" onClick={retry}>
          Retry
        </button>
      </div>
    ) : (
      <p className="muted small">Loading character data…</p>
    );

  const sheet = picked && dict && (
    <ComponentWords
      component={picked}
      dict={dict}
      excludeId={word.id}
      onClose={() => setPicked(null)}
      onOpenWord={
        onOpenWord &&
        ((w) => {
          setPicked(null);
          onOpenWord(w);
        })
      }
    />
  );

  if (collapsible) {
    return (
      // Stop taps from reaching the flashcard (which flips on click).
      <details className={cls} open={open} onClick={(e) => e.stopPropagation()}>
        <summary
          onClick={(e) => {
            e.preventDefault();
            updateSettings({ breakdownOpen: !open });
          }}
        >
          Breakdown
        </summary>
        {open && body}
        {sheet}
      </details>
    );
  }
  return (
    <section className={cls}>
      <h3>Breakdown</h3>
      {body}
      {sheet}
    </section>
  );
}

function CharBreakdown({ char, info, onPick }: { char: string; info: CharInfo | null; onPick(c: string): void }) {
  if (!info) {
    return (
      <div className="char-breakdown">
        <p className="muted small">
          No breakdown data for <span lang="zh-CN">{char}</span>.
        </p>
      </div>
    );
  }
  return (
    <div className="char-breakdown">
      <div className="char-head">
        <span className="char-big" lang="zh-CN">
          {char}
        </span>
        <span>
          <span className="pinyin">{info.pinyin.join(', ')}</span>
          {info.definition && <span className="muted small char-def"> {info.definition}</span>}
        </span>
      </div>

      {info.basic ? (
        <p className="small muted">Basic character, not built from smaller parts.</p>
      ) : (
        <>
          <div className="parts">
            {info.components.map((c, i) =>
              c.char ? (
                <button key={c.char} type="button" className="part" onClick={() => onPick(c.char!)} title={`Words with ${c.char}`}>
                  <span className="part-char" lang="zh-CN">
                    {c.char}
                  </span>
                  <span className="part-text">
                    {c.pinyin && <span className="pinyin">{c.pinyin}</span>}
                    <span>{c.meaning ?? 'component'}</span>
                  </span>
                  {c.role && <span className={`role ${c.role}`}>{c.role}</span>}
                </button>
              ) : (
                <span key={`unknown-${i}`} className="part unknown" title="The dataset doesn’t identify this part">
                  <span className="part-char">？</span>
                  <span className="part-text muted">unknown part</span>
                </span>
              ),
            )}
          </div>
          {info.structure && <p className="small muted">Structure: {info.structure}</p>}
        </>
      )}

      {info.radical && (
        <p className="small">
          <span className="muted">Radical </span>
          <button type="button" className="inline-part" onClick={() => onPick(info.radical!.char)} lang="zh-CN">
            {info.radical.char}
          </button>
          {info.radical.meaning && <span className="muted"> ({info.radical.meaning})</span>}
        </p>
      )}

      {info.etymology && <EtymologyLine ety={info.etymology} />}
    </div>
  );
}

const TYPE_LABEL: Record<Etymology['type'], string> = {
  ideographic: 'Ideographic',
  pictographic: 'Pictographic',
  pictophonetic: 'Meaning + sound',
};

function EtymologyLine({ ety }: { ety: Etymology }) {
  if (ety.type === 'pictophonetic') {
    const { semantic: s, phonetic: p } = ety;
    return (
      <p className="small etymology">
        <span className="ety-type">{TYPE_LABEL[ety.type]}</span>{' '}
        {s && (
          <>
            <b lang="zh-CN">{s.char}</b>
            {(ety.hint ?? s.meaning) && ` (${ety.hint ?? s.meaning})`} gives the meaning
          </>
        )}
        {s && p && '; '}
        {p && (
          <>
            <b lang="zh-CN">{p.char}</b>
            {p.pinyin && <span className="pinyin"> {p.pinyin}</span>} gives the sound
          </>
        )}
        {!s && !p && ety.hint}
        {(s || p) && '.'}
      </p>
    );
  }
  return (
    <p className="small etymology">
      <span className="ety-type">{TYPE_LABEL[ety.type]}</span> {ety.hint ? `“${ety.hint}”` : ''}
    </p>
  );
}

function ComponentWords({
  component,
  dict,
  excludeId,
  onClose,
  onOpenWord,
}: {
  component: string;
  dict: HanziDict;
  excludeId: string;
  onClose(): void;
  onOpenWord?(w: Word): void;
}) {
  const { words } = useStore();
  const matches = useMemo(() => wordsContaining(dict, component, words, excludeId), [dict, component, words, excludeId]);
  const g = gloss(dict, component);

  return (
    <Modal title={`Words with ${component}`} onClose={onClose}>
      <p className="small">
        <span className="char-big" lang="zh-CN">
          {component}
        </span>{' '}
        {g.pinyin && <span className="pinyin">{g.pinyin}</span>} {g.meaning && <span className="muted">{g.meaning}</span>}
      </p>
      {matches.length ? (
        <ul className="bulk-list component-words">
          {matches.map((w) => (
            <li key={w.id}>
              {onOpenWord ? (
                <button type="button" className="component-word" onClick={() => onOpenWord(w)}>
                  <span className="hanzi" lang="zh-CN">{w.hanzi}</span>
                  <span className="pinyin">{w.pinyin}</span>
                  <span className="meaning">{w.meaning}</span>
                </button>
              ) : (
                <>
                  <span className="hanzi" lang="zh-CN">{w.hanzi}</span>
                  <span className="pinyin">{w.pinyin}</span>
                  <span className="meaning">{w.meaning}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          No other words in your list contain <span lang="zh-CN">{component}</span>.
        </p>
      )}
    </Modal>
  );
}
