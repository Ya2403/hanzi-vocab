import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { formatDate, today } from '../lib/date';
import { toPinyin } from '../lib/pinyin';
import { formatInterval, isDue, isNew } from '../lib/srs';
import type { Word } from '../lib/types';
import { Breakdown } from './Breakdown';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { SpeakButton } from './SpeakButton';

export function WordDetail({ word: initial, onClose, onEdit }: { word: Word; onClose(): void; onEdit(w: Word): void }) {
  const { words, deleteWord } = useStore();
  // Tapping words in the Breakdown navigates within this view; keep a back stack.
  const [stack, setStack] = useState<string[]>([initial.id]);
  const currentId = stack[stack.length - 1];
  const word = words.find((w) => w.id === currentId);

  // The word was deleted (e.g. via Delete below): close the view.
  useEffect(() => {
    if (!word) onClose();
  }, [word, onClose]);
  if (!word) return null;

  const remove = async () => {
    if (!confirm(`Delete “${word.hanzi}” (${word.meaning})?`)) return;
    if (stack.length > 1) setStack((st) => st.slice(0, -1));
    await deleteWord(word.id);
  };

  const s = word.srs;
  const status = isNew(word)
    ? 'New: not studied yet'
    : isDue(word)
      ? 'Due for review today'
      : `Next review ${s.due === today() ? 'today' : formatDate(s.due)}`;

  return (
    <Modal title="Word" onClose={onClose}>
      <div className="word-detail" key={word.id}>
        {stack.length > 1 && (
          <button type="button" className="link-btn" onClick={() => setStack((st) => st.slice(0, -1))}>
            ← Back
          </button>
        )}
        <div className="detail-head">
          <span className="detail-hanzi" lang="zh-CN">
            {word.hanzi}
          </span>
          <SpeakButton text={word.hanzi} size={24} />
        </div>
        <div className="pinyin big">{word.pinyin}</div>
        <div className="detail-meaning">{word.meaning}</div>

        {word.example && (
          <div className="answer-example">
            <div lang="zh-CN">
              {word.example} <SpeakButton text={word.example} size={16} label="Play example" />
            </div>
            <div className="muted small">{toPinyin(word.example)}</div>
          </div>
        )}

        {word.tags.length > 0 && (
          <div className="word-meta">
            {word.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="detail-progress small">
          <b>{status}</b>
          {!isNew(word) && (
            <span className="muted">
              {' '}
              · interval {formatInterval(s.interval)} · {s.reps} correct in a row · forgotten {s.lapses}× · ease {s.ease.toFixed(2)}
            </span>
          )}
        </div>

        <Breakdown word={word} onOpenWord={(w) => setStack((st) => [...st, w.id])} />

        <div className="form-actions">
          <button type="button" className="btn ghost danger-text" onClick={remove}>
            <Icon name="trash" size={18} /> Delete
          </button>
          <button type="button" className="btn primary" onClick={() => onEdit(word)}>
            <Icon name="edit" size={18} /> Edit
          </button>
        </div>
      </div>
    </Modal>
  );
}
