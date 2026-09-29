import { formatDate, today } from '../lib/date';
import { skillStrength } from '../lib/planner';
import { accuracy, activeSkills, formatInterval, SKILL_LABEL, skillState } from '../lib/srs';
import type { Word } from '../lib/types';

/** One row per skill the word is reviewed on: next review, interval, accuracy and last 5 answers. */
export function SkillTable({ word }: { word: Word }) {
  const on = today();
  const skills = activeSkills(word);
  if (!skills.length) return null;
  return (
    <table className="skill-table small">
      <thead>
        <tr>
          <th>Skill</th>
          <th>Next</th>
          <th>Interval</th>
          <th>Accuracy · last 5</th>
        </tr>
      </thead>
      <tbody>
        {skills.map((k) => {
          const s = skillState(word, k, on);
          const acc = accuracy(s);
          const started = !!word.skills[k];
          return (
            <tr key={k} className={s.leech ? 'leech-row' : undefined}>
              <th scope="row">
                {SKILL_LABEL[k]}
                {s.leech && ' 🐛'}
                <span className={`strength-dot ${skillStrength(s, word.learnedOn, on)}`} title={skillStrength(s, word.learnedOn, on)} />
              </th>
              <td className={s.due <= on ? 'due-text' : undefined}>{s.due <= on ? (started ? 'due' : 'starts now') : formatDate(s.due)}</td>
              <td>
                {formatInterval(s.interval)}
                {s.lapses > 0 && <span className="muted" title="Times forgotten"> · {s.lapses}×</span>}
              </td>
              <td>
                {acc === null ? '–' : `${Math.round(acc * 100)}% (${s.correct ?? 0}/${s.answered}) `}
                {[...(s.recent ?? '')].map((r, i) => (
                  <span key={i} className={r === '1' ? 'acc-ok' : 'acc-bad'}>
                    {r === '1' ? '✓' : '✗'}
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
