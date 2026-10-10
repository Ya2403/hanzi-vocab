import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { normalizeSearch } from '../lib/pinyin';
import { needsTranslation } from '../lib/sentences';
import { updateSettings, useSettings } from '../lib/settings';
import { speakAll, stopSpeaking, speechSupported } from '../lib/speech';
import { parseTagText } from '../lib/words';
import type { Dialogue, Sentence, Word } from '../lib/types';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { NeedsTranslation, SentenceForm, SentenceRow, WordChips } from '../components/SentenceParts';
import { BulkSentences, FillTranslations } from '../components/SentenceBulk';
import { SpeakButton } from '../components/SpeakButton';
import { dialogueText, lastReadOf, Reader, type ReaderText } from '../components/Reader';
import { formatDate, toDateStr } from '../lib/date';
import { isReading } from '../lib/dailyReading';
import { NewReading } from '../components/DailyReading';

const NEEDS = '__needs__';

function PinyinToggle() {
  const { listPinyin } = useSettings();
  return (
    <button
      className={`pinyin-toggle ${listPinyin ? 'on' : ''}`}
      onClick={() => updateSettings({ listPinyin: !listPinyin })}
      aria-pressed={listPinyin}
      title={listPinyin ? 'Pinyin shown in the list: tap to hide' : 'Pinyin hidden in the list: tap to show'}
    >
      拼音
    </button>
  );
}

/** Words tab → Sentences: every sentence, with search, tag filter, bulk add and translations. */
export function SentencesView({ onOpenWord }: { onOpenWord(w: Word): void }) {
  const { sentences, dialogues, deleteSentences } = useStore();
  const { listPinyin } = useSettings();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<Sentence | 'new' | null>(null);
  const [bulk, setBulk] = useState<'sentences' | 'dialogue' | null>(null);
  const [filling, setFilling] = useState(false);
  const [reading, setReading] = useState<ReaderText | null>(null);

  const titles = useMemo(() => new Map(dialogues.map((d) => [d.id, d.title])), [dialogues]);
  const missing = sentences.filter(needsTranslation).length;
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sentences) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [sentences]);

  const visible = useMemo(() => {
    const q = normalizeSearch(query.trim());
    return sentences
      .filter(
        (s) =>
          (!tag || (tag === NEEDS ? needsTranslation(s) : s.tags.includes(tag))) &&
          (!q || s.zh.includes(query.trim()) || normalizeSearch(s.pinyin).includes(q) || normalizeSearch(s.translation).includes(q)),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [sentences, query, tag]);

  if (reading) return <Reader text={reading} onClose={() => setReading(null)} />;

  const remove = (s: Sentence) => {
    if (confirm(`Delete “${s.zh}”?${s.dialogueId ? ' It is also removed from its dialogue.' : ''}`)) deleteSentences([s.id]);
  };

  return (
    <>
      {sentences.length === 0 ? (
        <div className="empty card">
          <div className="empty-mark" lang="zh-CN">句</div>
          <h2>No sentences yet</h2>
          <p>Add sentences one by one, or paste a whole lesson from an AI chat.</p>
          <div className="row center">
            <button className="btn primary" onClick={() => setEditing('new')}>
              <Icon name="plus" /> Add sentence
            </button>
            <button className="btn" onClick={() => setBulk('sentences')}>
              Bulk add
            </button>
            <button className="btn" onClick={() => setBulk('dialogue')}>
              Add dialogue
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="search">
              <Icon name="search" size={18} />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Chinese, pinyin or translation" aria-label="Search sentences" />
            </label>
            <PinyinToggle />
          </div>
          <div className="chips scroll">
            <button className={`chip ${tag === null ? 'active' : ''}`} onClick={() => setTag(null)}>
              All <span className="count">{sentences.length}</span>
            </button>
            {missing > 0 && (
              <button className={`chip needs-chip ${tag === NEEDS ? 'active' : ''}`} onClick={() => setTag(tag === NEEDS ? null : NEEDS)}>
                Needs translation <span className="count">{missing}</span>
              </button>
            )}
            {tagCounts.map(([t, n]) => (
              <button key={t} className={`chip ${tag === t ? 'active' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                {t} <span className="count">{n}</span>
              </button>
            ))}
          </div>
          <div className="list-header">
            <span className="muted small">
              {visible.length} of {sentences.length} sentences
            </span>
            <span className="row">
              {tag && tag !== NEEDS && visible.length > 0 && (
                <button
                  className="link-btn"
                  onClick={() =>
                    setReading({ key: `t:${tag}`, title: tag, lines: [...visible].sort((a, b) => a.createdAt - b.createdAt).map((x) => ({ sentence: x })) })
                  }
                >
                  📖 Read “{tag}”{lastReadOf(`t:${tag}`) ? ` · read ${formatDate(toDateStr(new Date(lastReadOf(`t:${tag}`)!)))}` : ''}
                </button>
              )}
              {missing > 0 && (
                <button className="link-btn" onClick={() => setFilling(true)}>
                  Fill {missing} missing translation{missing === 1 ? '' : 's'}
                </button>
              )}
              <button className="link-btn" onClick={() => setBulk('sentences')}>
                Bulk add
              </button>
            </span>
          </div>
          <ul className="sentence-list-view">
            {visible.map((s) => (
              <SentenceRow
                key={s.id}
                sentence={s}
                showPinyin={listPinyin}
                dialogueTitle={s.dialogueId ? titles.get(s.dialogueId) : undefined}
                onOpenWord={onOpenWord}
                onEdit={() => setEditing(s)}
                onDelete={() => remove(s)}
              />
            ))}
          </ul>
          {visible.length === 0 && <p className="empty">No sentences match.</p>}
        </>
      )}

      <button className="fab" onClick={() => setEditing('new')} aria-label="Add sentence">
        <Icon name="plus" size={26} />
      </button>

      {editing && <SentenceForm sentence={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {bulk && <BulkSentences initialMode={bulk} onClose={() => setBulk(null)} />}
      {filling && <FillTranslations onClose={() => setFilling(false)} />}
    </>
  );
}

/** Words tab → Dialogues: lesson texts, each an ordered list of lines. */
export function DialoguesView({ onOpenWord }: { onOpenWord(w: Word): void }) {
  const { dialogues: all, sentences } = useStore();
  const dialogues = useMemo(() => all.filter((d) => !isReading(d)), [all]);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(sentences.map((s) => [s.id, s])), [sentences]);
  const list = [...dialogues].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const open = dialogues.find((d) => d.id === openId);
  const reading = dialogues.find((d) => d.id === readingId);

  if (reading) {
    const text = dialogueText(reading, sentences);
    return (
      <>
        <Reader
          text={text}
          onClose={() => setReadingId(null)}
          onEdit={() => {
            setReadingId(null);
            setOpenId(reading.id);
          }}
        />
      </>
    );
  }

  return (
    <>
      {dialogues.length === 0 ? (
        <div className="empty card">
          <div className="empty-mark" lang="zh-CN">课</div>
          <h2>No dialogues yet</h2>
          <p>Send a photo of a lesson slide to an AI chat with the prompt, then paste the answer: the whole dialogue becomes one item, line by line.</p>
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add dialogue
          </button>
        </div>
      ) : (
        <>
          <div className="list-header">
            <span className="muted small">{dialogues.length} dialogue{dialogues.length === 1 ? '' : 's'}</span>
            <button className="link-btn" onClick={() => setAdding(true)}>
              Add dialogue
            </button>
          </div>
          <ul className="dialogue-list">
            {list.map((d) => {
              const lines = d.lines.map((l) => byId.get(l.sentenceId)).filter((s): s is Sentence => !!s);
              const missing = lines.filter(needsTranslation).length;
              return (
                <li key={d.id} className="card dialogue-card" onClick={() => setReadingId(d.id)} role="button" tabIndex={0}>
                  <div className="dialogue-title" lang="zh-CN">
                    {d.title}
                  </div>
                  <div className="muted small">
                    {lines.length} line{lines.length === 1 ? '' : 's'}
                    {missing > 0 && ` · ${missing} without translation`}
                    {d.lastRead ? ` · read ${formatDate(toDateStr(new Date(d.lastRead)))}` : ' · not read yet'}
                  </div>
                  <div className="dialogue-preview" lang="zh-CN">
                    {lines
                      .slice(0, 2)
                      .map((s) => s.zh)
                      .join(' ')}
                  </div>
                  {d.tags.length > 0 && (
                    <div className="word-meta">
                      {d.tags.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <button className="fab" onClick={() => setAdding(true)} aria-label="Add dialogue">
        <Icon name="plus" size={26} />
      </button>
      {adding && <BulkSentences initialMode="dialogue" onClose={() => setAdding(false)} />}
      {open && <DialogueDetail dialogue={open} onClose={() => setOpenId(null)} onOpenWord={onOpenWord} />}
    </>
  );
}

/** Words tab → Readings: the daily readings, newest first. */
export function ReadingsView({ onOpenWord }: { onOpenWord(w: Word): void }) {
  const { dialogues, sentences } = useStore();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(sentences.map((s) => [s.id, s])), [sentences]);
  const list = useMemo(
    () => dialogues.filter(isReading).sort((a, b) => (b.readingDate ?? '').localeCompare(a.readingDate ?? '') || b.createdAt - a.createdAt),
    [dialogues],
  );
  const open = list.find((d) => d.id === openId);
  const reading = list.find((d) => d.id === readingId);

  if (reading) {
    return (
      <Reader
        text={dialogueText(reading, sentences)}
        onClose={() => setReadingId(null)}
        onEdit={() => {
          setReadingId(null);
          setOpenId(reading.id);
        }}
      />
    );
  }

  return (
    <>
      {list.length === 0 ? (
        <div className="empty card">
          <div className="empty-mark" lang="zh-CN">读</div>
          <h2>No readings yet</h2>
          <p>A reading is a short text an AI chat writes from the words you know. Get one here or from Practice → Today’s reading.</p>
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Get a new reading
          </button>
        </div>
      ) : (
        <>
          <div className="list-header">
            <span className="muted small">{list.length} reading{list.length === 1 ? '' : 's'}</span>
            <button className="link-btn" onClick={() => setAdding(true)}>
              Get a new reading
            </button>
          </div>
          <ul className="dialogue-list">
            {list.map((d) => {
              const lines = d.lines.map((l) => byId.get(l.sentenceId)).filter((s): s is Sentence => !!s);
              return (
                <li key={d.id} className="card dialogue-card" onClick={() => setReadingId(d.id)} role="button" tabIndex={0}>
                  <div className="dialogue-title">{d.title}</div>
                  <div className="muted small">
                    {d.readingDate ? formatDate(d.readingDate) : ''} · {lines.length} sentence{lines.length === 1 ? '' : 's'}
                    {d.lastRead ? ` · read ${formatDate(toDateStr(new Date(d.lastRead)))}` : ' · not read yet'}
                  </div>
                  <div className="dialogue-preview" lang="zh-CN">
                    {lines
                      .slice(0, 2)
                      .map((s) => s.zh)
                      .join(' ')}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <button className="fab" onClick={() => setAdding(true)} aria-label="Get a new reading">
        <Icon name="plus" size={26} />
      </button>
      {adding && (
        <NewReading
          onClose={() => setAdding(false)}
          onSaved={(d) => {
            setAdding(false);
            setReadingId(d.id);
          }}
        />
      )}
      {open && <DialogueDetail dialogue={open} onClose={() => setOpenId(null)} onOpenWord={onOpenWord} />}
    </>
  );
}

/** One dialogue: read it line by line, play it, and edit title, tags, speakers and line order. */
function DialogueDetail({ dialogue, onClose, onOpenWord }: { dialogue: Dialogue; onClose(): void; onOpenWord(w: Word): void }) {
  const { sentences, links, updateDialogue, updateSentences, deleteDialogue } = useStore();
  const { listPinyin } = useSettings();
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState(dialogue.title);
  const [tagText, setTagText] = useState(dialogue.tags.join(', '));
  const [editing, setEditing] = useState<Sentence | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const byId = useMemo(() => new Map(sentences.map((s) => [s.id, s])), [sentences]);
  const lines = dialogue.lines.map((l) => ({ ...l, s: byId.get(l.sentenceId) })).filter((l): l is typeof l & { s: Sentence } => !!l.s);

  const playAll = () => {
    if (playing !== null) {
      stopSpeaking();
      setPlaying(null);
      return;
    }
    setPlaying(0);
    speakAll(
      lines.map((l) => l.s.zh),
      () => setPlaying(null),
    );
  };

  const saveMeta = async () => {
    await updateDialogue({ ...dialogue, title, tags: parseTagText(tagText) });
    setEditMode(false);
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = dialogue.lines.slice();
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    updateDialogue({ ...dialogue, lines: next });
  };

  const setSpeaker = (i: number, speaker: string) => {
    const next = dialogue.lines.map((l, k) => (k === i ? { ...l, speaker: speaker.trim() || undefined } : l));
    updateDialogue({ ...dialogue, lines: next });
  };

  /** Remove a line from the dialogue; its sentence stays as a loose sentence. */
  const detach = async (i: number) => {
    const line = dialogue.lines[i];
    const s = byId.get(line.sentenceId);
    await updateDialogue({ ...dialogue, lines: dialogue.lines.filter((_, k) => k !== i) });
    if (s) await updateSentences([{ ...s, dialogueId: undefined }]);
  };

  const remove = async () => {
    if (!confirm(`Delete the ${isReading(dialogue) ? 'reading' : 'dialogue'} “${dialogue.title}”?`)) return;
    const withSentences = confirm(`Also delete its ${lines.length} sentences?\n\nOK: delete them too. Cancel: keep them as loose sentences.`);
    await deleteDialogue(dialogue.id, withSentences);
    onClose();
  };

  return (
    <Modal title={isReading(dialogue) ? 'Reading' : 'Dialogue'} onClose={onClose}>
      <div className="dialogue-detail">
        {editMode ? (
          <div className="form">
            <label className="field">
              <span className="field-label">Title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} lang="zh-CN" />
            </label>
            <label className="field">
              <span className="field-label">Tags</span>
              <input className="input" value={tagText} onChange={(e) => setTagText(e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="dialogue-head">
            <h2 lang="zh-CN">{dialogue.title}</h2>
            {dialogue.tags.length > 0 && (
              <div className="word-meta">
                {dialogue.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="row dialogue-actions">
          {speechSupported && !editMode && (
            <button className="btn small-btn" onClick={playAll}>
              <Icon name="speaker" size={16} /> {playing !== null ? 'Stop' : 'Play all'}
            </button>
          )}
          <PinyinToggle />
        </div>

        <ol className="dialogue-lines">
          {lines.map((l, i) => (
            <li key={l.sentenceId} className="dialogue-line">
              {editMode ? (
                <input className="input speaker-input" value={l.speaker ?? ''} onChange={(e) => setSpeaker(i, e.target.value)} placeholder="A" aria-label="Speaker" />
              ) : (
                l.speaker && <span className="speaker">{l.speaker}</span>
              )}
              <div className="dialogue-line-body">
                <div className="sentence-head">
                  <span className="sentence-zh" lang="zh-CN">
                    {l.s.zh}
                  </span>
                  <SpeakButton text={l.s.zh} size={18} />
                </div>
                {listPinyin && <div className="pinyin small">{l.s.pinyin}</div>}
                <div className="sentence-translation">{needsTranslation(l.s) ? <NeedsTranslation /> : l.s.translation}</div>
                <WordChips words={links.bySentence.get(l.s.id) ?? []} onOpen={onOpenWord} />
              </div>
              {editMode && (
                <div className="line-actions">
                  <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                    ↑
                  </button>
                  <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === lines.length - 1} aria-label="Move down" title="Move down">
                    ↓
                  </button>
                  <button className="icon-btn" onClick={() => setEditing(l.s)} aria-label="Edit sentence" title="Edit sentence">
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="icon-btn" onClick={() => detach(i)} aria-label="Remove from dialogue" title="Remove from dialogue (keeps the sentence)">
                    <Icon name="close" size={16} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className="form-actions">
          {editMode ? (
            <>
              <button type="button" className="btn ghost" onClick={() => setEditMode(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={saveMeta}>
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn ghost danger-text" onClick={remove}>
                <Icon name="trash" size={18} /> Delete
              </button>
              <button type="button" className="btn" onClick={() => setEditMode(true)}>
                <Icon name="edit" size={18} /> Edit
              </button>
            </>
          )}
        </div>
      </div>
      {editing && <SentenceForm sentence={editing} onClose={() => setEditing(null)} />}
    </Modal>
  );
}
