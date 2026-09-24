import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { formatDate, today } from '../lib/date';
import { normalizeSearch, toPinyin } from '../lib/pinyin';
import { isDue, isNew } from '../lib/srs';
import { sampleWords } from '../lib/sample';
import type { Word } from '../lib/types';
import { Icon } from '../components/Icon';
import { SpeakButton } from '../components/SpeakButton';
import { WordForm } from '../components/WordForm';
import { BulkAdd } from '../components/BulkAdd';
import { WordDetail } from '../components/WordDetail';

type Sort = 'newest' | 'oldest' | 'due' | 'pinyin';

export function WordsScreen() {
  const { words, loading, deleteWord, addWords } = useStore();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('newest');
  const [editing, setEditing] = useState<Word | 'new' | null>(null);
  const [bulk, setBulk] = useState(false);
  const [detail, setDetail] = useState<Word | null>(null);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of words) for (const t of w.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [words]);

  const visible = useMemo(() => {
    const q = normalizeSearch(query);
    const list = words.filter(
      (w) =>
        (!tag || w.tags.includes(tag)) &&
        (!q ||
          w.hanzi.includes(query.trim()) ||
          normalizeSearch(w.pinyin).includes(q) ||
          normalizeSearch(w.meaning).includes(q)),
    );
    const cmp: Record<Sort, (a: Word, b: Word) => number> = {
      newest: (a, b) => b.createdAt - a.createdAt,
      oldest: (a, b) => a.createdAt - b.createdAt,
      due: (a, b) => a.srs.due.localeCompare(b.srs.due),
      pinyin: (a, b) => normalizeSearch(a.pinyin).localeCompare(normalizeSearch(b.pinyin)),
    };
    return list.sort(cmp[sort]);
  }, [words, query, tag, sort]);

  const remove = (w: Word) => {
    if (confirm(`Delete “${w.hanzi}” (${w.meaning})?`)) deleteWord(w.id);
  };

  const loadSamples = () => addWords(sampleWords.map((s) => ({ ...s, pinyin: toPinyin(s.hanzi) })));

  if (loading) return <div className="empty">Loading…</div>;

  return (
    <section className="screen">
      {words.length === 0 ? (
        <div className="empty card">
          <div className="empty-mark" lang="zh-CN">词</div>
          <h2>Your word list is empty</h2>
          <p>Add your first word, or start with a dozen HSK 1 basics.</p>
          <div className="row center">
            <button className="btn primary" onClick={() => setEditing('new')}>
              <Icon name="plus" /> Add word
            </button>
            <button className="btn" onClick={() => setBulk(true)}>
              Bulk add
            </button>
          </div>
          <button className="link-btn" onClick={loadSamples}>
            or load 12 sample words
          </button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="search">
              <Icon name="search" size={18} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search hanzi, pinyin or meaning"
                aria-label="Search words"
              />
            </label>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="due">Due soonest</option>
              <option value="pinyin">Pinyin A–Z</option>
            </select>
          </div>

          {tagCounts.length > 0 && (
            <div className="chips scroll">
              <button className={`chip ${tag === null ? 'active' : ''}`} onClick={() => setTag(null)}>
                All <span className="count">{words.length}</span>
              </button>
              {tagCounts.map(([t, n]) => (
                <button key={t} className={`chip ${tag === t ? 'active' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                  {t} <span className="count">{n}</span>
                </button>
              ))}
            </div>
          )}

          <div className="list-header">
            <span className="muted small">
              {visible.length} of {words.length} words
            </span>
            <span className="row">
              {tag && (
                <button className="link-btn" onClick={() => (location.hash = `practice?tag=${encodeURIComponent(tag)}`)}>
                  Practice “{tag}”
                </button>
              )}
              <button className="link-btn" onClick={() => setBulk(true)}>
                Bulk add
              </button>
            </span>
          </div>

          <ul className="word-list">
            {visible.map((w) => (
              <WordRow key={w.id} word={w} onOpen={() => setDetail(w)} onEdit={() => setEditing(w)} onDelete={() => remove(w)} />
            ))}
          </ul>
          {visible.length === 0 && <p className="empty">No words match.</p>}
        </>
      )}

      <button className="fab" onClick={() => setEditing('new')} aria-label="Add word">
        <Icon name="plus" size={26} />
      </button>

      {detail && (
        <WordDetail
          word={detail}
          onClose={() => setDetail(null)}
          onEdit={(w) => {
            setDetail(null);
            setEditing(w);
          }}
        />
      )}
      {editing && <WordForm word={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {bulk && <BulkAdd onClose={() => setBulk(false)} />}
    </section>
  );
}

function WordRow({ word, onOpen, onEdit, onDelete }: { word: Word; onOpen(): void; onEdit(): void; onDelete(): void }) {
  const status = isNew(word) ? (
    <span className="status new">new</span>
  ) : isDue(word) ? (
    <span className="status due">due</span>
  ) : (
    <span className="status">{word.srs.due === today() ? 'today' : formatDate(word.srs.due)}</span>
  );

  return (
    <li className="word-row card">
      <div className="word-main" onClick={onOpen}>
        <div className="word-head">
          <span className="hanzi" lang="zh-CN">{word.hanzi}</span>
          <span className="pinyin">{word.pinyin}</span>
        </div>
        <div className="meaning">{word.meaning}</div>
        {word.example && (
          <div className="example" lang="zh-CN">
            {word.example}
          </div>
        )}
        <div className="word-meta">
          {status}
          {word.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="word-actions">
        <SpeakButton text={word.hanzi} />
        <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${word.hanzi}`}>
          <Icon name="edit" />
        </button>
        <button className="icon-btn danger" onClick={onDelete} aria-label={`Delete ${word.hanzi}`}>
          <Icon name="trash" />
        </button>
      </div>
    </li>
  );
}
