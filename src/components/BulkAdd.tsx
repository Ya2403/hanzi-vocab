import { useDeferredValue, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../store';
import { BULK_PROMPT, parseBulk } from '../lib/bulk';
import { parseTagText } from '../lib/words';
import { Modal } from './Modal';

const PREVIEW_LIMIT = 200;

export function BulkAdd({ onClose }: { onClose(): void }) {
  const { words, addWords } = useStore();
  const [text, setText] = useState('');
  const [extraTags, setExtraTags] = useState('');
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const deferredText = useDeferredValue(text);
  const { rows, errors } = useMemo(() => parseBulk(deferredText), [deferredText]);

  // Mark words already in the list, or repeated within the pasted text.
  const preview = useMemo(() => {
    const existing = new Set(words.map((w) => w.hanzi));
    const seen = new Set<string>();
    return rows.map((r) => {
      const status = existing.has(r.word.hanzi) ? 'exists' : seen.has(r.word.hanzi) ? 'repeat' : 'new';
      seen.add(r.word.hanzi);
      return { ...r, status };
    });
  }, [rows, words]);
  const fresh = preview.filter((r) => r.status === 'new');
  const skipped = preview.length - fresh.length;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(BULK_PROMPT);
      setCopied('ok');
    } catch {
      // Clipboard API unavailable (e.g. plain http): reveal and select the prompt for manual copy.
      setCopied('failed');
      requestAnimationFrame(() => promptRef.current?.select());
    }
  };

  const pasteClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      setError('Couldn’t read the clipboard. Long-press the box below and choose Paste.');
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setText(await file.text());
  };

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      const tags = parseTagText(extraTags);
      await addWords(fresh.map((r) => ({ ...r.word, tags: [...r.word.tags, ...tags] })));
      onClose();
    } catch (e) {
      console.error(e);
      setError('Could not save the words.');
      setSaving(false);
    }
  };

  return (
    <Modal title="Bulk add words" onClose={onClose}>
      <div className="form">
        <ol className="steps">
          <li>
            Copy the prompt and send it to ChatGPT (or any AI chat) together with your PDF, photo or word list.
            <div className="row">
              <button type="button" className="btn small-btn" onClick={copyPrompt}>
                {copied === 'ok' ? 'Copied ✓' : 'Copy prompt'}
              </button>
            </div>
            <details open={copied === 'failed'}>
              <summary className="muted small">Show prompt</summary>
              <textarea ref={promptRef} className="input mono" rows={8} readOnly value={BULK_PROMPT} />
            </details>
          </li>
          <li>Paste its answer below and check the preview.</li>
        </ol>

        <div className="field">
          <div className="field-label-row">
            <span className="field-label">Word list</span>
            <span className="row">
              {'clipboard' in navigator && 'readText' in navigator.clipboard && (
                <button type="button" className="link-btn" onClick={pasteClipboard}>
                  Paste
                </button>
              )}
              <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
                Open file
              </button>
              {text && (
                <button type="button" className="link-btn" onClick={() => setText('')}>
                  Clear
                </button>
              )}
            </span>
          </div>
          <textarea
            className="input mono"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'你好 | nǐ hǎo | hello | 你好，我叫小明。 | greetings\n猫 | māo | cat |  | animals'}
            lang="zh-CN"
            spellCheck={false}
          />
          <input ref={fileRef} type="file" accept=".txt,.tsv,.csv,.json,.md,text/*,application/json" hidden onChange={onFile} />
          <span className="hint">One word per line: hanzi | pinyin | meaning | example | tags. Missing pinyin is generated.</span>
        </div>

        <label className="field">
          <span className="field-label">
            Add tags to all <span className="optional">optional</span>
          </span>
          <input className="input" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="e.g. Lesson 5" />
        </label>

        {(preview.length > 0 || errors.length > 0) && (
          <div className="bulk-preview">
            <p className="small">
              <b>{fresh.length}</b> new
              {skipped > 0 && <span className="muted"> · {skipped} already in your list (skipped)</span>}
              {errors.length > 0 && <span className="warn-text"> · {errors.length} line{errors.length > 1 ? 's' : ''} not understood</span>}
            </p>
            {errors.length > 0 && (
              <ul className="bulk-errors">
                {errors.slice(0, 20).map((e) => (
                  <li key={`${e.line}-${e.text}`}>
                    {e.line > 0 && <span className="muted">Line {e.line}: </span>}
                    {e.reason} — <span className="mono">{e.text.length > 60 ? `${e.text.slice(0, 60)}…` : e.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="bulk-list">
              {preview.slice(0, PREVIEW_LIMIT).map((r) => (
                <li key={r.line} className={r.status !== 'new' ? 'dup' : ''}>
                  <span className="hanzi" lang="zh-CN">{r.word.hanzi}</span>
                  <span className="pinyin">{r.word.pinyin}</span>
                  <span className="meaning">{r.word.meaning}</span>
                  {r.status !== 'new' && <span className="status">{r.status === 'exists' ? 'in list' : 'repeat'}</span>}
                  {r.word.tags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </li>
              ))}
            </ul>
            {preview.length > PREVIEW_LIMIT && <p className="muted small">…and {preview.length - PREVIEW_LIMIT} more</p>}
          </div>
        )}

        {error && <p className="hint error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!fresh.length || saving} onClick={add}>
            Add {fresh.length || ''} word{fresh.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
