import { useDeferredValue, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../store';
import { BULK_PROMPT, parseBulk } from '../lib/bulk';
import { createWord, parseTagText } from '../lib/words';
import type { NewWord, Word } from '../lib/types';
import { Segmented } from './Segmented';
import { Modal } from './Modal';

const PREVIEW_LIMIT = 200;

export function BulkAdd({ onClose }: { onClose(): void }) {
  const { words, sentences, dialogues, addWords, updateWords, importData } = useStore();
  /** What to do with pasted words that are already in the list. */
  const [mode, setMode] = useState<'tags' | 'new' | 'update' | 'replace'>('tags');
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
  const existingRows = preview.filter((r) => r.status === 'exists');
  const byHanzi = useMemo(() => new Map(words.map((w) => [w.hanzi, w])), [words]);
  const pasted = new Set(preview.map((r) => r.word.hanzi));
  // Replace: every current word that isn't in the pasted list gets deleted.
  const toDelete = mode === 'replace' ? words.filter((w) => !pasted.has(w.hanzi)).length : 0;
  const skipped = mode === 'new' ? preview.length - fresh.length : preview.length - fresh.length - existingRows.length;
  // Add tags only: existing entries that would actually get a new tag.
  const extraTagList = parseTagText(extraTags);
  const newTagsFor = (w: Word, p: NewWord) => {
    const have = new Set(w.tags.map((t) => t.toLowerCase()));
    return [...p.tags, ...extraTagList].filter((t) => !have.has(t.toLowerCase()));
  };
  const tagged = mode === 'tags' ? existingRows.filter((r) => newTagsFor(byHanzi.get(r.word.hanzi)!, r.word).length > 0) : [];
  const count = mode === 'new' ? fresh.length : mode === 'tags' ? fresh.length + tagged.length : fresh.length + existingRows.length;

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
      const extra = parseTagText(extraTags);
      const input = (w: NewWord): NewWord => ({ ...w, tags: [...w.tags, ...extra] });
      // An existing word gets the pasted content; its id, progress and notes stay. Empty pasted
      // fields (example, tags) don't wipe what the word already has.
      // A pasted example becomes a sentence linked to the word (see the store).
      const merged = (w: Word, p: NewWord): Word => ({
        ...w,
        pinyin: p.pinyin || w.pinyin,
        meaning: p.meaning || w.meaning,
        example: p.example || undefined,
        tags: p.tags.length ? [...p.tags, ...extra] : [...w.tags, ...extra],
      });
      if (mode === 'new') {
        await addWords(fresh.map((r) => input(r.word)));
      } else if (mode === 'tags') {
        // Existing entries keep everything (meaning, progress…) and only get the new tags.
        await updateWords(
          tagged.map((r) => {
            const w = byHanzi.get(r.word.hanzi)!;
            return { ...w, tags: [...w.tags, ...newTagsFor(w, r.word)] };
          }),
        );
        if (fresh.length) await addWords(fresh.map((r) => input(r.word)));
      } else if (mode === 'update') {
        await updateWords(existingRows.map((r) => merged(byHanzi.get(r.word.hanzi)!, r.word)));
        if (fresh.length) await addWords(fresh.map((r) => input(r.word)));
      } else {
        const ok = confirm(
          `Replace your whole list with these ${count} words? ${toDelete} word${toDelete === 1 ? '' : 's'} not in this list will be deleted (on all synced devices too). Words already in your list keep their progress.`,
        );
        if (!ok) {
          setSaving(false);
          return;
        }
        const now = Date.now();
        const list: Word[] = [];
        const seen = new Set<string>();
        preview.forEach((r, i) => {
          if (seen.has(r.word.hanzi)) return; // repeats in the pasted text
          seen.add(r.word.hanzi);
          const old = byHanzi.get(r.word.hanzi);
          const fresh = input(r.word);
          list.push(old ? merged(old, r.word) : { ...createWord(fresh, now + i), example: fresh.example || undefined });
        });
        await importData({ words: list, sentences, dialogues, hasSentences: true }, 'replace');
      }
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
          <span className="hint">One word per line: hanzi | pinyin | meaning | example | tags. Missing pinyin is generated. An example becomes a sentence linked to the word (add its translation later in Words → Sentences).</span>
        </div>

        <Segmented
          label="Words already in your list"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'tags', label: 'Add tags only' },
            { value: 'new', label: 'Skip' },
            { value: 'update', label: 'Update' },
            { value: 'replace', label: 'Replace all' },
          ]}
        />
        <p className="hint">
          {mode === 'tags'
            ? 'New words are added; existing ones keep everything (meaning, examples, progress) and only get the new tags.'
            : mode === 'new'
            ? 'Only words that aren’t in your list yet are added.'
            : mode === 'update'
              ? 'New words are added; existing ones get the pasted pinyin, meaning, example and tags. Study progress is kept.'
              : 'Your list becomes exactly these words, on all synced devices. Existing ones keep their progress; everything else is deleted.'}
        </p>

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
              {existingRows.length > 0 &&
                (mode === 'tags' ? (
                  <span className="muted">
                    {' '}
                    · {existingRows.length} already in your list ({tagged.length ? `${tagged.length} get new tags` : 'no new tags'})
                  </span>
                ) : mode === 'new' ? (
                  <span className="muted"> · {existingRows.length} already in your list (skipped)</span>
                ) : (
                  <span> · {existingRows.length} already in your list (updated, progress kept)</span>
                ))}
              {mode !== 'new' && mode !== 'tags' && skipped > 0 && <span className="muted"> · {skipped} repeated (skipped)</span>}
              {mode === 'replace' && toDelete > 0 && <span className="warn-text"> · {toDelete} other words will be deleted</span>}
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
          <button type="button" className={`btn primary ${mode === 'replace' ? 'danger-btn' : ''}`} disabled={!count || saving} onClick={add}>
            {mode === 'replace'
              ? `Replace list (${count} words)`
              : mode === 'update' && existingRows.length
                ? `Add ${fresh.length} · update ${existingRows.length}`
                : mode === 'tags' && tagged.length
                  ? `Add ${fresh.length} · tag ${tagged.length}`
                : `Add ${fresh.length || ''} word${fresh.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
