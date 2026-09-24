import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { toPinyin } from '../lib/pinyin';
import { findSentences, matchLabel, useCorpus, type Corpus, type SentenceMatch } from '../lib/tatoeba';
import type { Word } from '../lib/types';
import { Modal } from './Modal';
import { TatoebaCredit } from './WordExtras';

/** Sentence with the target word highlighted. */
export function Highlighted({ text, target }: { text: string; target: string }) {
  const i = target ? text.indexOf(target) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="target">{target}</mark>
      {text.slice(i + target.length)}
    </>
  );
}

function MatchBody({ m, target }: { m: SentenceMatch; target: string }) {
  return (
    <>
      <span className="sentence-zh" lang="zh-CN">
        <Highlighted text={m.sentence.zh} target={target} />
      </span>
      <span className="muted small">{toPinyin(m.sentence.zh)}</span>
      <span className="small">{m.sentence.en}</span>
      <span className="sentence-meta">
        <span className={`known-label ${m.unknown.length ? '' : 'all'}`} title={m.unknown.length ? `New: ${m.unknown.join(' ')}` : undefined}>
          {matchLabel(m)}
        </span>
        <TatoebaCredit id={m.sentence.zhId} />
      </span>
    </>
  );
}

const LoadState = ({ status, retry }: { status: string; retry(): void }) =>
  status === 'error' ? (
    <div className="breakdown-error">
      <p className="hint">Example sentences need a one-time download. You seem to be offline.</p>
      <button type="button" className="btn small-btn" onClick={retry}>
        Retry
      </button>
    </div>
  ) : (
    <p className="muted small">Loading sentences…</p>
  );

/** Word editor panel: top Tatoeba matches for `hanzi`; tap one to use it as the example. */
export function FindSentences({
  hanzi,
  onPick,
  onClose,
}: {
  hanzi: string;
  onPick(m: SentenceMatch): void;
  onClose(): void;
}) {
  const { words } = useStore();
  const { status, corpus, retry } = useCorpus(true);
  const target = hanzi.trim();
  const matches = useMemo(() => (corpus ? findSentences(corpus, { hanzi: target }, words, 8) : []), [corpus, target, words]);

  return (
    <div className="find-sentences">
      <div className="field-label-row">
        <span className="field-label">Sentences with “{target}”</span>
        <button type="button" className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>
      {status !== 'ready' ? (
        <LoadState status={status} retry={retry} />
      ) : !matches.length ? (
        <p className="muted small">No Tatoeba sentences contain “{target}”.</p>
      ) : (
        <>
          {matches[0].via === 'substring' && (
            <p className="hint">Matched as part of longer words: the segmenter splits “{target}” differently.</p>
          )}
          <ul className="sentence-list">
            {matches.map((m) => (
              <li key={m.sentence.zhId}>
                <button type="button" className="sentence-option" onClick={() => onPick(m)}>
                  <MatchBody m={m} target={target} />
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">Tap a sentence to use it as this word’s example.</p>
        </>
      )}
    </div>
  );
}

/** Bulk action: give every word without an example its best-ranked Tatoeba sentence. */
export function TatoebaBulk({ onClose }: { onClose(): void }) {
  const { words, updateWords } = useStore();
  const { status, corpus, retry } = useCorpus(true);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(() => words.filter((w) => !w.example), [words]);
  const plan = useMemo(() => (corpus ? planBulk(corpus, candidates, words) : null), [corpus, candidates, words]);
  const chosen = plan ? plan.found.filter((f) => !excluded.has(f.word.id)) : [];

  const apply = async () => {
    setSaving(true);
    await updateWords(
      chosen.map(({ word, match }) => ({
        ...word,
        example: match.sentence.zh,
        exampleTranslation: match.sentence.en,
        exampleRef: match.sentence.zhId,
      })),
    );
    onClose();
  };

  const toggle = (id: string) =>
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal title="Add Tatoeba sentences" onClose={onClose}>
      <div className="form">
        <p className="small muted">
          For each word without an example sentence, the best match: all other words known if possible, then the shortest.
          Untick any you don’t want.
        </p>
        {!candidates.length ? (
          <p>Every word already has an example sentence. 🎉</p>
        ) : status !== 'ready' || !plan ? (
          <LoadState status={status} retry={retry} />
        ) : (
          <>
            <p className="small">
              <b>{plan.found.length}</b> of {candidates.length} words have a match
              {plan.missing.length > 0 && (
                <span className="muted">
                  {' '}
                  · none for <span lang="zh-CN">{plan.missing.map((w) => w.hanzi).join('、')}</span>
                </span>
              )}
            </p>
            <ul className="sentence-list bulk-sentences">
              {plan.found.map(({ word, match }) => (
                <li key={word.id} className={excluded.has(word.id) ? 'off' : ''}>
                  <label className="bulk-sentence">
                    <input type="checkbox" checked={!excluded.has(word.id)} onChange={() => toggle(word.id)} />
                    <span className="bulk-sentence-body">
                      <span className="small">
                        <b lang="zh-CN">{word.hanzi}</b> · {word.meaning}
                      </span>
                      <MatchBody m={match} target={word.hanzi} />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!chosen.length || saving} onClick={apply}>
            Add {chosen.length || ''} sentence{chosen.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function planBulk(corpus: Corpus, candidates: Word[], myWords: Word[]) {
  const found: { word: Word; match: SentenceMatch }[] = [];
  const missing: Word[] = [];
  for (const word of candidates) {
    const [best] = findSentences(corpus, word, myWords, 1);
    if (best) found.push({ word, match: best });
    else missing.push(word);
  }
  return { found, missing };
}
