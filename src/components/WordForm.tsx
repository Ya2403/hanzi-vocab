import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { toPinyin } from '../lib/pinyin';
import { parseTagText } from '../lib/words';
import { formatInterval, isLeech, isNew, newSrs, unmarkLeech } from '../lib/srs';
import { LeechBadge } from './WordExtras';
import type { Word } from '../lib/types';
import { Modal } from './Modal';
import { SpeakButton } from './SpeakButton';
import { Icon } from './Icon';
import { FindSentences } from './Sentences';

export function WordForm({ word, onClose }: { word?: Word; onClose(): void }) {
  const { words, addWord, updateWord } = useStore();
  const [hanzi, setHanzi] = useState(word?.hanzi ?? '');
  const [pinyin, setPinyin] = useState(word?.pinyin ?? '');
  // Keep pinyin in sync with hanzi until the user types their own.
  const [pinyinAuto, setPinyinAuto] = useState(!word || word.pinyin === toPinyin(word.hanzi));
  const [meaning, setMeaning] = useState(word?.meaning ?? '');
  const [example, setExample] = useState(word?.example ?? '');
  // Set when the example came from Tatoeba; dropped as soon as the text is edited by hand.
  const [exampleSource, setExampleSource] = useState<{ translation?: string; ref?: number }>({
    translation: word?.exampleTranslation,
    ref: word?.exampleRef,
  });
  const [finding, setFinding] = useState(false);
  const [notes, setNotes] = useState(word?.notes ?? '');
  // The stored version (progress may change while the dialog is open).
  const live = word && words.find((w) => w.id === word.id);

  const resetProgress = () => {
    if (!live) return;
    if (confirm(`Reset all review progress for “${live.hanzi}”? It will be treated as a new word, and its lapse count and leech mark are cleared.`))
      updateWord({ ...live, srs: newSrs() });
  };
  const [tagText, setTagText] = useState(word?.tags.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allTags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words]);
  const tags = parseTagText(tagText);
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const duplicate = words.find((w) => w.hanzi === hanzi.trim() && w.id !== word?.id);

  const onHanzi = (v: string) => {
    setHanzi(v);
    if (pinyinAuto) setPinyin(toPinyin(v));
  };

  const onPinyin = (v: string) => {
    setPinyin(v);
    setPinyinAuto(v.trim() === '');
  };

  const regenerate = () => {
    setPinyin(toPinyin(hanzi));
    setPinyinAuto(true);
  };

  const toggleTag = (t: string) => {
    const next = tagSet.has(t.toLowerCase()) ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t];
    setTagText(next.join(', '));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hanzi.trim() || !meaning.trim()) {
      setError('Chinese and meaning are required.');
      return;
    }
    setSaving(true);
    try {
      const input = {
        hanzi,
        pinyin: pinyin.trim() || toPinyin(hanzi),
        meaning,
        example,
        exampleTranslation: exampleSource.translation,
        exampleRef: exampleSource.ref,
        notes,
        tags,
      };
      // Merge onto the stored word so progress changes made in this dialog aren't overwritten.
      if (word) await updateWord({ ...(live ?? word), ...input });
      else await addWord(input);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Could not save the word.');
      setSaving(false);
    }
  };

  return (
    <Modal title={word ? 'Edit word' : 'Add word'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Chinese</span>
          <div className="input-row">
            <input
              className="input hanzi-input"
              value={hanzi}
              onChange={(e) => onHanzi(e.target.value)}
              placeholder="汉字"
              lang="zh-CN"
              autoFocus
              required
            />
            <SpeakButton text={hanzi} />
          </div>
          {duplicate && <span className="hint warn">“{duplicate.hanzi}” is already in your list.</span>}
        </label>

        <label className="field">
          <span className="field-label">
            Pinyin {pinyinAuto && hanzi && <span className="badge">auto</span>}
          </span>
          <div className="input-row">
            <input className="input" value={pinyin} onChange={(e) => onPinyin(e.target.value)} placeholder="hàn zì" />
            <button type="button" className="icon-btn" onClick={regenerate} title="Regenerate from Chinese" aria-label="Regenerate pinyin">
              <Icon name="refresh" />
            </button>
          </div>
        </label>

        <label className="field">
          <span className="field-label">Meaning</span>
          <input className="input" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="Chinese character" required />
        </label>

        <label className="field">
          <span className="field-label">
            Example sentence <span className="optional">optional</span>
          </span>
          <textarea
            className="input"
            rows={2}
            value={example}
            onChange={(e) => {
              setExample(e.target.value);
              setExampleSource({});
            }}
            lang="zh-CN"
            placeholder="我在学汉字。"
          />
          {example.trim() && <span className="hint">{toPinyin(example)}</span>}
          {exampleSource.translation && <span className="hint">{exampleSource.translation}</span>}
          {!finding && (
            <button type="button" className="link-btn align-start" onClick={() => setFinding(true)} disabled={!hanzi.trim()}>
              Find sentences
            </button>
          )}
        </label>
        {finding && (
          <FindSentences
            hanzi={hanzi}
            onClose={() => setFinding(false)}
            onPick={(m) => {
              setExample(m.sentence.zh);
              setExampleSource({ translation: m.sentence.en, ref: m.sentence.zhId });
              setFinding(false);
            }}
          />
        )}

        <label className="field">
          <span className="field-label">
            Notes / mnemonic <span className="optional">optional</span>
          </span>
          <textarea
            className="input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="A memory trick, usage note, or anything else"
          />
        </label>

        <label className="field">
          <span className="field-label">
            Tags <span className="optional">comma separated</span>
          </span>
          <input className="input" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="HSK1, food" />
        </label>
        {allTags.length > 0 && (
          <div className="chips">
            {allTags.map((t) => (
              <button key={t} type="button" className={`chip ${tagSet.has(t.toLowerCase()) ? 'active' : ''}`} onClick={() => toggleTag(t)}>
                {t}
              </button>
            ))}
          </div>
        )}

        {live && !isNew(live) && (
          <div className="field">
            <span className="field-label">Progress</span>
            <div className="progress-box small">
              <span>
                {isLeech(live) && (
                  <>
                    <LeechBadge />{' '}
                  </>
                )}
                Forgotten {live.srs.lapses}× · {live.srs.reps} correct in a row · interval {formatInterval(live.srs.interval)}
              </span>
              <div className="row">
                {isLeech(live) && (
                  <button type="button" className="btn small-btn" onClick={() => updateWord({ ...live, srs: unmarkLeech(live.srs) })}>
                    Unmark leech
                  </button>
                )}
                <button type="button" className="btn small-btn ghost danger-text" onClick={resetProgress}>
                  Reset progress
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <p className="hint error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {word ? 'Save' : 'Add word'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
