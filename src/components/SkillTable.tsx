import { today } from '../lib/date';
import { retrievability } from '../lib/fsrs';
import { skillStrength } from '../lib/planner';
import { accuracy, activeSkills, SKILL_LABEL, skillState } from '../lib/srs';
import type { Word } from '../lib/types';

/** One row per skill: strength, how likely you are to remember it right now, accuracy and last 5 answers. */
export function SkillTable({ word }: { word: Word }) {
  const on = today();
  const now = Date.now();
  const skills = activeSkills(word);
  if (!skills.length) return null;
  return (
    <table className="skill-table small">
      <thead>
        <tr>
          <th>Skill</th>
          <th>Strength</th>
          <th title="How likely you are to remember it right now">Recall now</th>
          <th>Accuracy · last 5</th>
        </tr>
      </thead>
      <tbody>
        {skills.map((k) => {
          const s = skillState(word, k, on);
          const acc = accuracy(s);
          const strength = skillStrength(s, word.learnedOn, on);
          const r = retrievability(s, now);
          return (
            <tr key={k} className={s.leech ? 'leech-row' : undefined}>
              <th scope="row">
                {SKILL_LABEL[k]}
                {s.leech && ' 🐛'}
              </th>
              <td>
                <span className={`strength-dot ${strength}`} /> {strength}
                {s.lapses > 0 && <span className="muted" title="Times forgotten"> · {s.lapses}×</span>}
              </td>
              <td className={r < 0.7 ? 'due-text' : undefined}>{Math.round(r * 100)}%</td>
              <td>
                {acc === null ? '–' : `${Math.round(acc * 100)}% (${s.correct ?? 0}/${s.answered}) `}
                {[...(s.recent ?? '')].map((x, i) => (
                  <span key={i} className={x === '1' ? 'acc-ok' : 'acc-bad'}>
                    {x === '1' ? '✓' : '✗'}
                  </span>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
