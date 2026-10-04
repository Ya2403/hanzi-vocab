import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { DIALOGUE_PROMPT, parseSentenceBulk, parseTranslations, SENTENCE_PROMPT, translationPrompt } from '../lib/sentences';
import { parseTagText } from '../lib/words';
import { Modal } from './Modal';
import { Segmented } from './Segmented';

const PREVIEW_LIMIT = 200;

/** "Copy prompt" with a fallback textarea when the clipboard isn't available. */
function PromptCopy({ prompt, what }: { prompt: string; what: string }) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied('ok');
    } catch {
      setCopied('failed');
      requestAnimationFrame(() => ref.current?.select());
    }
  };
  return (
    <>
      {what}
      <div className="row">
        <button type="button" className="btn small-btn" onClick={copy}>
          {copied === 'ok' ? 'Copied ✓' : 'Copy prompt'}
        </button>
      </div>
      <details open={copied === 'failed'}>
        <summary className="muted small">Show prompt</summary>
        <textarea ref={ref} className="input mono" rows={8} readOnly value={prompt} />
      </details>
    </>
  );
}

function PasteBox({ value, onChange, placeholder, label }: { value: string; onChange(v: string): void; placeholder: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const paste = async () => {
    try {
      onChange(await navigator.clipboard.readText());
    } catch {
      setError('Couldn’t read the clipboard. Long-press the box below and choose Paste.');
    }
  };
  return (
    <div className="field">
      <div className="field-label-row">
        <span className="field-label">{label}</span>
        <span className="row">
          {'clipboard' in navigator && 'readText' in navigator.clipboard && (
            <button type="button" className="link-btn" onClick={paste}>
              Paste
            </button>
          )}
          {value && (
            <button type="button" className="link-btn" onClick={() => onChange('')}>
              Clear
            </button>
          )}
        </span>
      </div>
      <textarea className="input mono" rows={7} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} lang="zh-CN" spellCheck={false} />
      {error && <span className="hint warn">{error}</span>}
    </div>
  );
}

/**
 * Bulk add sentences (`chinese | pinyin | translation | tags`), or a whole dialogue
 * (`A: chinese | …`, in order, plus extra example sentences after "--- examples").
 */
export function BulkSentences({ initialMode = 'sentences', onClose }: { initialMode?: 'sentences' | 'dialogue'; onClose(): void }) {
  const { sentences, addSentences, addDialogue, updateSentences } = useStore();
  const [mode, setMode] = useState(initialMode);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [extraTags, setExtraTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogue = mode === 'dialogue';

  const deferred = useDeferredValue(text);
  const { rows, errors } = useMemo(() => parseSentenceBulk(deferred, dialogue), [deferred, dialogue]);
  const existing = useMemo(() => new Set(sentences.map((s) => s.zh)), [sentences]);
  // Loose sentences already in the list are skipped; dialogue lines are always added (in order).
  const lines = dialogue ? rows.filter((r) => !r.extra) : [];
  const loose = (dialogue ? rows.filter((r) => r.extra) : rows).filter(
    (r, i, all) => !existing.has(r.input.zh) && all.findIndex((x) => x.input.zh === r.input.zh) === i,
  );
  const skipped = (dialogue ? rows.filter((r) => r.extra).length : rows.length) - loose.length;
  // Sentences already in the list without a translation get the pasted one.
  const toTranslate = useMemo(() => {
    const byZh = new Map(sentences.filter((x) => !x.translation.trim()).map((x) => [x.zh, x]));
    const out = new Map<string, string>();
    for (const r of dialogue ? rows.filter((x) => x.extra) : rows) {
      const x = byZh.get(r.input.zh);
      if (x && !out.has(x.id)) out.set(x.id, r.input.translation);
    }
    return out;
  }, [rows, sentences, dialogue]);

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      const tags = parseTagText(extraTags);
      const withTags = <T extends { tags: string[] }>(x: T) => ({ ...x, tags: [...x.tags, ...tags] });
      if (dialogue && lines.length) {
        await addDialogue(
          title || 'Dialogue',
          [...new Set([...tags, ...lines.flatMap((l) => l.input.tags)])],
          lines.map((l) => ({ input: withTags(l.input), speaker: l.speaker })),
        );
      }
      if (loose.length) await addSentences(loose.map((r) => withTags(r.input)));
      if (toTranslate.size) await updateSentences(sentences.filter((x) => toTranslate.has(x.id)).map((x) => ({ ...x, translation: toTranslate.get(x.id)! })));
      onClose();
    } catch (e) {
      console.error(e);
      setError('Could not save the sentences.');
      setSaving(false);
    }
  };

  const count = lines.length + loose.length + toTranslate.size;

  return (
    <Modal title={dialogue ? 'Add a dialogue' : 'Bulk add sentences'} onClose={onClose}>
      <div className="form">
        <Segmented
          label="What are you adding?"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'sentences', label: 'Sentences' },
            { value: 'dialogue', label: 'Dialogue / lesson' },
          ]}
        />
        <ol className="steps">
          <li>
            <PromptCopy
              prompt={dialogue ? DIALOGUE_PROMPT : SENTENCE_PROMPT}
              what={
                dialogue
                  ? 'Copy the prompt and send it to ChatGPT (or any AI chat) with a photo of the lesson slide or textbook page. It returns the dialogue line by line, plus the lesson’s extra example sentences.'
                  : 'Copy the prompt and send it to ChatGPT (or any AI chat) with your PDF, photo or sentence list.'
              }
            />
          </li>
          <li>Paste its answer below and check the preview.</li>
        </ol>

        <PasteBox
          label={dialogue ? 'Dialogue' : 'Sentences'}
          value={text}
          onChange={setText}
          placeholder={
            dialogue
              ? 'A: 你好！ | nǐ hǎo! | Hello! | lesson 1\nB: 你叫什么名字？ |  | What is your name? | lesson 1\n--- examples\n他叫王明。 |  | His name is Wang Ming. |'
              : '你好！ | nǐ hǎo! | Hello! | lesson 1\n我是学生。 |  | I am a student. | lesson 1'
          }
        />
        <span className="hint">
          One per line: {dialogue && 'speaker: '}chinese | pinyin | translation | tags. Empty pinyin is generated; the translation is
          required.
        </span>

        {dialogue && (
          <label className="field">
            <span className="field-label">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="第一课 课文3" lang="zh-CN" />
          </label>
        )}
        <label className="field">
          <span className="field-label">
            Add tags to all <span className="optional">optional</span>
          </span>
          <input className="input" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="e.g. HSK lesson 1" />
        </label>

        {(rows.length > 0 || errors.length > 0) && (
          <div className="bulk-preview">
            <p className="small">
              {dialogue && (
                <>
                  <b>{lines.length}</b> dialogue line{lines.length === 1 ? '' : 's'} ·{' '}
                </>
              )}
              <b>{loose.length}</b> {dialogue ? 'extra ' : ''}sentence{loose.length === 1 ? '' : 's'}
              {skipped > 0 && (
                <span className="muted">
                  {' '}
                  · {skipped} already in your list (skipped{toTranslate.size ? `; ${toTranslate.size} ${toTranslate.size === 1 ? 'gets its' : 'get their'} missing translation` : ''})
                </span>
              )}
              {errors.length > 0 && (
                <span className="warn-text">
                  {' '}
                  · {errors.length} line{errors.length > 1 ? 's' : ''} with problems
                </span>
              )}
            </p>
            {errors.length > 0 && (
              <ul className="bulk-errors">
                {errors.slice(0, 20).map((e) => (
                  <li key={`${e.line}-${e.text}`}>
                    <span className="muted">Line {e.line}: </span>
                    {e.reason} — <span className="mono">{e.text.length > 60 ? `${e.text.slice(0, 60)}…` : e.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="bulk-list sentence-preview">
              {rows.slice(0, PREVIEW_LIMIT).map((r) => {
                const dup = (!dialogue || r.extra) && !loose.includes(r);
                return (
                  <li key={r.line} className={dup ? 'dup' : ''}>
                    {dialogue && (r.extra ? <span className="tag">example</span> : r.speaker && <span className="speaker">{r.speaker}</span>)}
                    <span className="hanzi" lang="zh-CN">
                      {r.input.zh}
                    </span>
                    <span className="pinyin">{r.input.pinyin}</span>
                    <span className="meaning">{r.input.translation}</span>
                    {dup && <span className="status">in list</span>}
                    {r.input.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && <p className="hint error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!count || saving || (dialogue && !lines.length && !loose.length)} onClick={add}>
            {dialogue && lines.length
              ? `Add dialogue (${lines.length} lines)${loose.length ? ` + ${loose.length}` : ''}`
              : `Add ${loose.length || ''} sentence${loose.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Sentences without a translation: build an AI prompt for them, paste the answer, apply. */
export function FillTranslations({ onClose }: { onClose(): void }) {
  const { sentences, updateSentences } = useStore();
  const missing = useMemo(() => sentences.filter((s) => !s.translation.trim()), [sentences]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const deferred = useDeferredValue(text);
  const found = useMemo(() => parseTranslations(deferred, missing), [deferred, missing]);
  const prompt = useMemo(() => translationPrompt(missing), [missing]);

  const apply = async () => {
    setSaving(true);
    await updateSentences(missing.filter((s) => found.has(s.id)).map((s) => ({ ...s, translation: found.get(s.id)! })));
    onClose();
  };

  return (
    <Modal title="Fill missing translations" onClose={onClose}>
      <div className="form">
        {!missing.length ? (
          <p>Every sentence has a translation. 🎉</p>
        ) : (
          <>
            <ol className="steps">
              <li>
                <PromptCopy prompt={prompt} what={`Copy the prompt (it lists your ${missing.length} sentences without a translation) and send it to ChatGPT or any AI chat.`} />
              </li>
              <li>Paste its answer below.</li>
            </ol>
            <PasteBox label="Translations" value={text} onChange={setText} placeholder={'我是学生。 | I am a student.'} />
            {text.trim() && (
              <div className="bulk-preview">
                <p className="small">
                  <b>{found.size}</b> of {missing.length} sentences matched
                </p>
                <ul className="bulk-list sentence-preview">
                  {missing
                    .filter((s) => found.has(s.id))
                    .slice(0, PREVIEW_LIMIT)
                    .map((s) => (
                      <li key={s.id}>
                        <span className="hanzi" lang="zh-CN">
                          {s.zh}
                        </span>
                        <span className="meaning">{found.get(s.id)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </>
        )}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!found.size || saving} onClick={apply}>
            Save {found.size || ''} translation{found.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
