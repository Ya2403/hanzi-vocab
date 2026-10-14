import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { toPinyin } from '../lib/pinyin';
import { parseTagText } from '../lib/words';
import { isLeech, isNew, leechSkills, unmarkLeech } from '../lib/srs';
import { SkillTable } from './SkillTable';
import { LeechBadge } from './WordExtras';
import type { Word } from '../lib/types';
import { Modal } from './Modal';
import { SpeakButton } from './SpeakButton';
import { Icon } from './Icon';
import { FindSentences } from './Sentences';
import { Segmented } from './Segmented';
import { LockState } from './Entries';
import { detectKind, isCharEntry, type EntryKind } from '../lib/entries';

const KIND_LABEL: Record<EntryKind, string> = { char: 'Character', word: 'Word', name: 'Name' };

/** `initial`: prefilled fields for a new word (e.g. a word tapped in the reader). */
export function WordForm({ word, initial, onClose }: { word?: Word; initial?: Partial<Pick<Word, 'hanzi' | 'pinyin' | 'meaning' | 'tags'>>; onClose(): void }) {
  const { words, links, addWord, updateWord, addSentences } = useStore();
  const [hanzi, setHanzi] = useState(word?.hanzi ?? initial?.hanzi ?? '');
  const [pinyin, setPinyin] = useState(word?.pinyin ?? initial?.pinyin ?? '');
  // Keep pinyin in sync with hanzi until the user types their own.
  const [pinyinAuto, setPinyinAuto] = useState(!word || word.pinyin === toPinyin(word.hanzi));
  const [meaning, setMeaning] = useState(word?.meaning ?? initial?.meaning ?? '');
  // A new example sentence, saved as a Sentence linked to this word.
  const [example, setExample] = useState('');
  const [exampleTranslation, setExampleTranslation] = useState('');
  // Set when the example came from Tatoeba; dropped as soon as the text is edited by hand.
  const [exampleRef, setExampleRef] = useState<number | undefined>(undefined);
  const linkedSentences = (word && links.byWord.get(word.id)) ?? [];
  const [finding, setFinding] = useState(false);
  const [notes, setNotes] = useState(word?.notes ?? '');
  // The stored version (progress may change while the dialog is open).
  const live = word && words.find((w) => w.id === word.id);

  const resetProgress = () => {
    if (!live) return;
    if (confirm(`Reset all review progress for “${live.hanzi}”? It will be treated as a new word (learn it again in Learn), and all its skills, lapse counts and leech marks are cleared.`))
      updateWord({ ...live, skills: {}, learnedOn: undefined, toneErrors: undefined });
  };
  const [tagText, setTagText] = useState((word?.tags ?? initial?.tags)?.join(', ') ?? '');
  // Character / word / name: detected from the entry unless set here (null = detected).
  const [kindSet, setKindSet] = useState<EntryKind | null>(word?.kind ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allTags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words]);
  const tags = parseTagText(tagText);
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const duplicate = words.find((w) => w.hanzi === hanzi.trim() && w.id !== word?.id);
  const detected = detectKind({ hanzi, tags });
  const kind = kindSet ?? detected;

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
        notes,
        tags,
        // Only a kind that differs from the detected one is stored.
        kind: kind === detected ? undefined : kind,
      };
      // Merge onto the stored word so progress changes made in this dialog aren't overwritten.
      let saved = word;
      if (word) await updateWord({ ...(live ?? word), ...input });
      else saved = await addWord(input);
      if (saved && example.trim() && !linkedSentences.some((x) => x.zh === example.trim())) {
        await addSentences([{ zh: example, pinyin: '', translation: exampleTranslation, tags, wordIds: [saved.id], tatoebaId: exampleRef }]);
      }
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

        <Segmented
          label={`Kind (detected: ${KIND_LABEL[detected].toLowerCase()})`}
          value={kind}
          onChange={(v) => setKindSet(v === detected ? null : v)}
          options={[
            { value: 'char', label: KIND_LABEL.char },
            { value: 'word', label: KIND_LABEL.word },
            { value: 'name', label: KIND_LABEL.name },
          ]}
        />
        <p className="hint">
          {kind === 'char'
            ? 'Characters are learned in Learn and practised with their own schedule.'
            : kind === 'name'
              ? 'Names unlock once their characters are learned, and are only used for meaning exercises.'
              : 'Words have no schedule of their own: they unlock once all their characters are learned and then come up in exercises.'}
        </p>
        {live && kind !== 'char' && <LockState word={live} />}

        <div className="field">
          <span className="field-label">
            Example sentences <span className="optional">optional</span>
          </span>
          {linkedSentences.length > 0 && (
            <ul className="linked-sentences small">
              {linkedSentences.slice(0, 5).map((x) => (
                <li key={x.id}>
                  <span lang="zh-CN">{x.zh}</span>{' '}
                  {x.translation ? <span className="muted">{x.translation}</span> : <span className="status needs">needs translation</span>}
                </li>
              ))}
              {linkedSentences.length > 5 && <li className="muted">…and {linkedSentences.length - 5} more (Words → Sentences)</li>}
            </ul>
          )}
          <textarea
            className="input"
            rows={2}
            value={example}
            onChange={(e) => {
              setExample(e.target.value);
              setExampleRef(undefined);
            }}
            lang="zh-CN"
            placeholder={linkedSentences.length ? 'Add another sentence…' : '我在学汉字。'}
            aria-label="New example sentence"
          />
          {example.trim() && (
            <>
              <span className="hint">{toPinyin(example)}</span>
              <input
                className="input"
                value={exampleTranslation}
                onChange={(e) => setExampleTranslation(e.target.value)}
                placeholder="English translation (optional; can be filled in later)"
                aria-label="Translation of the new sentence"
              />
            </>
          )}
          {!finding && (
            <button type="button" className="link-btn align-start" onClick={() => setFinding(true)} disabled={!hanzi.trim()}>
              Find sentences
            </button>
          )}
        </div>
        {finding && (
          <FindSentences
            hanzi={hanzi}
            onClose={() => setFinding(false)}
            onPick={(m) => {
              setExample(m.sentence.zh);
              setExampleTranslation(m.sentence.en);
              setExampleRef(m.sentence.zhId);
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

        {live && !isNew(live) && isCharEntry(live) && (
          <div className="field">
            <span className="field-label">Progress</span>
            <div className="progress-box small">
              {isLeech(live) && <LeechBadge skills={leechSkills(live)} />}
              <SkillTable word={live} />
              <div className="row">
                {isLeech(live) && (
                  <button type="button" className="btn small-btn" onClick={() => updateWord(unmarkLeech(live))}>
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
