import { useMemo } from 'react';
import { useStore } from '../store';
import { today } from '../lib/date';
import { isSentenceLearned } from '../lib/sentenceLearn';
import { isSentenceDue, SENTENCE_SKILLS, sentenceSkillState } from '../lib/sentenceReview';
import type { Sentence } from '../lib/types';

/** A dialogue is mastered when every line is learned with intervals of 3+ weeks on both skills. */
export const MASTERED_INTERVAL = 21;
const mastered = (s: Sentence) => isSentenceLearned(s) && SENTENCE_SKILLS.every((k) => sentenceSkillState(s, k).interval >= MASTERED_INTERVAL);

interface Counts {
  total: number;
  learned: number;
  due: number;
}

const count = (list: Sentence[], on: string): Counts => ({
  total: list.length,
  learned: list.filter(isSentenceLearned).length,
  due: list.filter((s) => isSentenceDue(s, on)).length,
});

/** Stats → Sentences: new / learned / due overall and per tag, and progress per dialogue. */
export function SentenceStats() {
  const { sentences, dialogues } = useStore();
  const on = today();
  const { all, tags, perDialogue } = useMemo(() => {
    const byId = new Map(sentences.map((s) => [s.id, s]));
    const tagNames = [...new Set(sentences.flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return {
      all: count(sentences, on),
      tags: tagNames.map((t) => ({ tag: t, ...count(sentences.filter((s) => s.tags.includes(t)), on) })),
      perDialogue: [...dialogues]
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
        .map((d) => {
          const lines = d.lines.map((l) => byId.get(l.sentenceId)).filter((s): s is Sentence => !!s);
          return { d, ...count(lines, on), mastered: lines.length > 0 && lines.every(mastered) };
        }),
    };
  }, [sentences, dialogues, on]);

  if (!sentences.length) return null;

  return (
    <div className="card sentence-stats">
      <h2>Sentences</h2>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">{all.total - all.learned}</div>
          <div className="stat-label">new</div>
        </div>
        <div className="stat">
          <div className="stat-value">{all.learned}</div>
          <div className="stat-label">learned</div>
        </div>
        <div className="stat">
          <div className="stat-value">{all.due}</div>
          <div className="stat-label">due now</div>
        </div>
      </div>

      {perDialogue.length > 0 && (
        <>
          <h3>Dialogues</h3>
          <ul className="dialogue-progress">
            {perDialogue.map(({ d, total, learned, due, mastered: done }) => (
              <li key={d.id}>
                <div className="dp-head">
                  <span lang="zh-CN">{d.title}</span>
                  {done ? (
                    <span className="status ready">mastered ✓</span>
                  ) : (
                    <span className="muted small">
                      {learned}/{total} learned{due ? ` · ${due} due` : ''}
                    </span>
                  )}
                </div>
                <span className="lp-bar" aria-hidden="true">
                  <span style={{ width: `${total ? (learned / total) * 100 : 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Mastered: every line learned, with both skills at intervals of 3 weeks or more.</p>
        </>
      )}

      {tags.length > 0 && (
        <div className="table-scroll">
          <table className="skill-table tag-table small">
            <thead>
              <tr>
                <th>Tag</th>
                <th>New</th>
                <th>Learned</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.tag}>
                  <th scope="row">{t.tag}</th>
                  <td>{t.total - t.learned}</td>
                  <td>{t.learned}</td>
                  <td className={t.due ? 'due-text' : undefined}>{t.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
