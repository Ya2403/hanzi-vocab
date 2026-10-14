import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { toPinyin } from '../lib/pinyin';
import { computeLinks, createSentence, needsTranslation } from '../lib/sentences';
import { parseTagText } from '../lib/words';
import { isReadable } from '../lib/sentenceLearn';
import type { Sentence, Word } from '../lib/types';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { SpeakButton } from './SpeakButton';
import { TatoebaCredit } from './WordExtras';

/** The words of my list that a sentence contains, as tappable chips. */
export function WordChips({ words, onOpen }: { words: Word[]; onOpen(w: Word): void }) {
  if (!words.length) return null;
  return (
    <div className="word-chips">
      {words.map((w) => (
        <button
          key={w.id}
          type="button"
          className="word-chip"
          lang="zh-CN"
          title={`${w.pinyin} · ${w.meaning}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(w);
          }}
        >
          {w.hanzi}
        </button>
      ))}
    </div>
  );
}

export function NeedsTranslation() {
  return <span className="status needs">needs translation</span>;
}

/** One sentence in a list: Chinese with audio, pinyin, translation, linked words, tags. */
export function SentenceRow({
  sentence: s,
  showPinyin,
  speaker,
  dialogueTitle,
  onOpenWord,
  onEdit,
  onDelete,
}: {
  sentence: Sentence;
  showPinyin: boolean;
  speaker?: string;
  dialogueTitle?: string;
  onOpenWord(w: Word): void;
  onEdit?(): void;
  onDelete?(): void;
}) {
  const { links } = useStore();
  const [revealed, setRevealed] = useState(false);
  return (
    <li className="sentence-row card">
      <div className="sentence-main">
        <div className="sentence-head">
          {speaker && <span className="speaker">{speaker}</span>}
          <span
            className={`sentence-zh ${showPinyin || revealed ? '' : 'can-reveal'}`}
            lang="zh-CN"
            onClick={() => setRevealed(true)}
            title={showPinyin ? undefined : 'Tap for pinyin'}
          >
            {s.zh}
          </span>
          <SpeakButton text={s.zh} size={18} />
        </div>
        {(showPinyin || revealed) && <div className="pinyin small">{s.pinyin}</div>}
        <div className="sentence-translation">{needsTranslation(s) ? <NeedsTranslation /> : s.translation}</div>
        <WordChips words={links.bySentence.get(s.id) ?? []} onOpen={onOpenWord} />
        {(
          <div className="word-meta">
            {isReadable(s, links) && <span className="status ready">readable</span>}
            {dialogueTitle && <span className="tag dialogue-tag">💬 {dialogueTitle}</span>}
            {s.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
            {s.tatoebaId ? <TatoebaCredit id={s.tatoebaId} /> : null}
          </div>
        )}
      </div>
      {(onEdit || onDelete) && (
        <div className="word-actions">
          {onEdit && (
            <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${s.zh}`} title="Edit">
              <Icon name="edit" size={18} />
            </button>
          )}
          {onDelete && (
            <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${s.zh}`} title="Delete">
              <Icon name="trash" size={18} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Add or edit a sentence. */
export function SentenceForm({ sentence, onClose }: { sentence?: Sentence; onClose(): void }) {
  const { words, sentences, dialogues, addSentences, updateSentences } = useStore();
  const [zh, setZh] = useState(sentence?.zh ?? '');
  const [pinyin, setPinyin] = useState(sentence?.pinyin ?? '');
  // Generated from the Chinese until edited by hand.
  const [pinyinAuto, setPinyinAuto] = useState(!sentence || sentence.pinyin === toPinyin(sentence.zh));
  const [translation, setTranslation] = useState(sentence?.translation ?? '');
  const [tagText, setTagText] = useState(sentence?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(sentence?.notes ?? '');
  // Other correct ways to say it, one per line.
  const [altText, setAltText] = useState(sentence?.alternatives?.join('\n') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogue = sentence?.dialogueId ? dialogues.find((d) => d.id === sentence.dialogueId) : undefined;
  const duplicate = sentences.find((x) => x.zh === zh.trim() && x.id !== sentence?.id);

  // Live preview of the words this sentence links to.
  const linked = useMemo(() => {
    const draft = createSentence({ zh: zh || ' ', pinyin: 'x', translation: '', tags: [], wordIds: sentence?.wordIds }, 0, 'draft');
    return computeLinks([draft], words).bySentence.get('draft') ?? [];
  }, [zh, words]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!zh.trim() || !translation.trim()) return setError('Chinese and translation are required.');
    setSaving(true);
    const alternatives = altText
      .split(/\r?\n/)
      .map((a) => a.trim())
      .filter(Boolean);
    const input = { zh, pinyin: pinyinAuto ? toPinyin(zh) : pinyin, translation, tags: parseTagText(tagText), notes, alternatives };
    try {
      if (sentence) await updateSentences([{ ...sentence, ...input }]);
      else await addSentences([{ ...input, wordIds: undefined }]);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Could not save the sentence.');
      setSaving(false);
    }
  };

  return (
    <Modal title={sentence ? 'Edit sentence' : 'Add sentence'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {dialogue && <p className="hint">Line of the dialogue “{dialogue.title}”.</p>}
        <label className="field">
          <span className="field-label">Chinese</span>
          <textarea
            className="input big-input"
            rows={2}
            value={zh}
            onChange={(e) => {
              setZh(e.target.value);
              if (pinyinAuto) setPinyin(toPinyin(e.target.value));
            }}
            lang="zh-CN"
            placeholder="我在学汉字。"
            autoFocus={!sentence}
            required
          />
          {duplicate && <span className="hint warn">This sentence is already in your list.</span>}
        </label>
        <label className="field">
          <span className="field-label">
            Pinyin {pinyinAuto && <span className="optional">auto</span>}
          </span>
          <input
            className="input"
            value={pinyin}
            onChange={(e) => {
              setPinyin(e.target.value);
              setPinyinAuto(false);
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Translation</span>
          <textarea className="input" rows={2} value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder="I am learning Chinese characters." required />
        </label>
        <label className="field">
          <span className="field-label">
            Tags <span className="optional">comma-separated</span>
          </span>
          <input className="input" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="lesson 1" />
        </label>
        <label className="field">
          <span className="field-label">
            Also correct <span className="optional">optional, one per line</span>
          </span>
          <textarea className="input" rows={2} value={altText} onChange={(e) => setAltText(e.target.value)} lang="zh-CN" placeholder="我在学中文字。" />
          <span className="hint">Other ways to say it, accepted when you build or type this sentence.</span>
        </label>
        <label className="field">
          <span className="field-label">
            Notes <span className="optional">optional</span>
          </span>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label">Words in this sentence</span>
          {linked.length ? (
            <div className="word-chips">
              {linked.map((w) => (
                <span key={w.id} className="word-chip static" lang="zh-CN" title={`${w.pinyin} · ${w.meaning}`}>
                  {w.hanzi}
                </span>
              ))}
            </div>
          ) : (
            <span className="hint">None of your words yet.</span>
          )}
        </div>
        {error && <p className="hint error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
