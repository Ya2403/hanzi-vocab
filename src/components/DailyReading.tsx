import { useDeferredValue, useMemo, useState } from 'react';
import { useStore } from '../store';
import { isReading, pendingReading, previewReading, READING_EXERCISES, READING_TAG, readingPrompt, readingTitle, UNKNOWN_WARN } from '../lib/dailyReading';
import { today } from '../lib/date';
import type { Dialogue } from '../lib/types';
import { Modal } from './Modal';
import { PasteBox, PromptCopy } from './SentenceBulk';

/** Practice → "Today's reading": today's reading (read it now) and "Get a new reading". */
export function TodayReadingCard({ onRead }: { onRead(d: Dialogue): void }) {
  const { dialogues } = useStore();
  const [adding, setAdding] = useState(false);
  const on = today();
  const todays = dialogues.filter((d) => isReading(d) && d.readingDate === on).sort((a, b) => b.createdAt - a.createdAt)[0];
  const pending = pendingReading(dialogues, on);

  return (
    <div className="card today-reading">
      <div className="today-reading-head">
        <h3>📖 Today’s reading</h3>
        {todays && <span className={`status-pill ${pending ? '' : 'done'}`}>{pending ? 'not read yet' : 'read ✓'}</span>}
      </div>
      {todays ? (
        <>
          <button className="link-btn today-reading-title" lang="zh-CN" onClick={() => onRead(todays)}>
            {todays.title} · {todays.lines.length} sentences
          </button>
          {pending && <p className="muted small">It opens first in your next practice session (it counts as {READING_EXERCISES} exercises).</p>}
        </>
      ) : (
        <p className="muted small">A short text made from the words you know, with the ones that need practice. An AI chat writes it; you paste it here.</p>
      )}
      <div className="row">
        <button className={`btn small-btn ${todays ? '' : 'primary'}`} onClick={() => setAdding(true)}>
          Get a new reading
        </button>
        {todays && (
          <button className="btn small-btn ghost" onClick={() => onRead(todays)}>
            Read now
          </button>
        )}
      </div>
      {adding && (
        <NewReading
          onClose={() => setAdding(false)}
          onSaved={(d) => {
            setAdding(false);
            onRead(d);
          }}
        />
      )}
    </div>
  );
}

/** Copy the prompt, paste the AI's answer, check the unknown words, save as a reading. */
export function NewReading({ onClose, onSaved }: { onClose(): void; onSaved(d: Dialogue): void }) {
  const { words, addDialogue } = useStore();
  const prompt = useMemo(() => readingPrompt(words), [words]);
  const [text, setText] = useState('');
  const on = today();
  const [title, setTitle] = useState(() => readingTitle(on));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferred = useDeferredValue(text);
  const preview = useMemo(() => previewReading(deferred, words), [deferred, words]);
  const pct = Math.round(preview.unknownShare * 100);
  const tooHard = preview.unknownShare > UNKNOWN_WARN;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const d = await addDialogue(
        title.trim() || readingTitle(on),
        [READING_TAG],
        preview.rows.map((r) => ({ input: { ...r.input, tags: [...new Set([...r.input.tags, READING_TAG])] } })),
        { kind: 'reading', readingDate: on },
      );
      onSaved(d);
    } catch (e) {
      console.error(e);
      setError('Could not save the reading.');
      setSaving(false);
    }
  };

  return (
    <Modal title="New reading" onClose={onClose}>
      <div className="form">
        <ol className="steps">
          <li>
            <PromptCopy
              prompt={prompt}
              what="Copy the prompt and send it to ChatGPT (or any AI chat). It lists the words you’ve learned and the 30 that need practice most."
            />
          </li>
          <li>Paste its answer below and check the preview.</li>
        </ol>
        <PasteBox label="Reading" value={text} onChange={setText} placeholder={'今天我去学校。 | Today I go to school.\n我的老师很好。 | My teacher is very nice.'} />
        <span className="hint">One sentence per line: chinese | translation.</span>

        {(preview.rows.length > 0 || preview.errors.length > 0) && (
          <div className="bulk-preview reading-preview">
            <p className="small">
              <b>{preview.rows.length}</b> sentence{preview.rows.length === 1 ? '' : 's'} · {pct}% unknown words
              {preview.errors.length > 0 && (
                <span className="warn-text">
                  {' '}
                  · {preview.errors.length} line{preview.errors.length > 1 ? 's' : ''} with problems
                </span>
              )}
            </p>
            {tooHard && (
              <p className="hint warn">
                More than {Math.round(UNKNOWN_WARN * 100)}% of the words aren’t ones you’ve learned ({preview.unknown.join('、')}). You can still save it, or ask
                the AI to use only your words.
              </p>
            )}
            {preview.errors.length > 0 && (
              <ul className="bulk-errors">
                {preview.errors.slice(0, 10).map((e) => (
                  <li key={`${e.line}-${e.text}`}>
                    <span className="muted">Line {e.line}: </span>
                    {e.reason} — <span className="mono">{e.text.length > 60 ? `${e.text.slice(0, 60)}…` : e.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <ol className="reading-preview-lines">
              {preview.rows.map((r, i) => (
                <li key={r.line}>
                  <div lang="zh-CN" className="reading-preview-zh">
                    {preview.tokens[i].map((t, k) =>
                      t.kind === 'other' || t.kind === 'learned' ? (
                        <span key={k}>{t.text}</span>
                      ) : (
                        <mark key={k} className={`unknown-word ${t.kind}`} title={t.kind === 'new' ? 'In your list, not learned yet' : 'Not in your list'}>
                          {t.text}
                        </mark>
                      ),
                    )}
                  </div>
                  <div className="muted small">{r.input.translation}</div>
                </li>
              ))}
            </ol>
          </div>
        )}

        <label className="field">
          <span className="field-label">Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        {error && <p className="hint error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!preview.rows.length || saving} onClick={save}>
            Save and read
          </button>
        </div>
      </div>
    </Modal>
  );
}
