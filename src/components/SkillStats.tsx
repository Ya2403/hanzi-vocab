import { useMemo } from 'react';
import { useSettings } from '../lib/settings';
import { SKILL_LABEL } from '../lib/srs';
import { skillTotals, tagProgress, toneTrouble } from '../lib/stats';
import type { Skill, Word } from '../lib/types';

/** Stats by skill: known per skill, per-tag progress, and (with tones on) the words to practise tones on. */
export function SkillStats({ words, onPracticeTones }: { words: Word[]; onPracticeTones(list: Word[]): void }) {
  const { writingPractice, tones } = useSettings();
  const skills: Skill[] = ['meaning', 'pinyin', 'recall', ...(writingPractice ? (['writing'] as Skill[]) : [])];
  const totals = useMemo(() => skillTotals(words), [words, writingPractice]);
  const tags = useMemo(() => tagProgress(words), [words, writingPractice]);
  const trouble = useMemo(() => toneTrouble(words), [words]);

  return (
    <div className="card skill-stats">
      <h2>Skills</h2>
      <p className="skill-totals">
        {skills.map((k, i) => (
          <span key={k}>
            {i > 0 && ' · '}
            <b>{SKILL_LABEL[k]}</b>: {totals[k].known} known
          </span>
        ))}
      </p>
      <p className="muted small">Known = reviewed at intervals of a week or more.</p>

      {tags.length > 0 && (
        <div className="table-scroll">
          <table className="skill-table tag-table small">
            <thead>
              <tr>
                <th>Tag</th>
                <th>New</th>
                <th>Learned</th>
                {skills.map((k) => (
                  <th key={k} title={`${SKILL_LABEL[k]} known`}>
                    {SKILL_LABEL[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.tag}>
                  <th scope="row">{t.tag}</th>
                  <td>{t.total - t.learned}</td>
                  <td>{t.learned}</td>
                  {skills.map((k) => (
                    <td key={k}>
                      <span className="mini-bar" aria-hidden="true">
                        <span style={{ width: `${t.learned ? (t.known[k] / t.learned) * 100 : 0}%` }} />
                      </span>
                      {t.known[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tones !== 'ignore' && (
        <div className="tones-practice">
          <h3>Tones to practice</h3>
          {trouble.length ? (
            <>
              <ul className="tone-list">
                {trouble.slice(0, 20).map((w) => (
                  <li key={w.id}>
                    <span className="hanzi" lang="zh-CN">
                      {w.hanzi}
                    </span>{' '}
                    <span className="pinyin">{w.pinyin}</span> <span className="muted small">× {w.toneErrors}</span>
                  </li>
                ))}
              </ul>
              <button className="btn block" onClick={() => onPracticeTones(trouble.slice(0, 20))}>
                Practice pinyin for these ({Math.min(20, trouble.length)})
              </button>
            </>
          ) : (
            <p className="muted small">No tone errors yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
