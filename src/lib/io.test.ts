import { describe, expect, it } from 'vitest';
import { parseImport } from './io';

describe('parseImport', () => {
  it('keeps notes and leech data from an export', () => {
    const file = JSON.stringify({
      words: [
        {
          hanzi: '学校',
          meaning: 'school',
          notes: '  a child 子 learning under a roof  ',
          srs: { ease: 2.1, interval: 1, reps: 0, lapses: 5, due: '2026-09-24', leech: true, lapsesAtUnmark: 2 },
        },
      ],
    });
    const [w] = parseImport(file).words;
    expect(w.notes).toBe('a child 子 learning under a roof');
    expect(w.srs.leech).toBe(true);
    expect(w.srs.lapses).toBe(5);
    expect(w.srs.lapsesAtUnmark).toBe(2);
  });

  it('starts older exports without these fields at zero / unmarked', () => {
    const [w] = parseImport(JSON.stringify([{ hanzi: '猫', meaning: 'cat', srs: { ease: 2.5, interval: 3, reps: 2, due: '2026-09-24' } }])).words;
    expect(w.notes).toBeUndefined();
    expect(w.srs.lapses).toBe(0);
    expect(w.srs.leech).toBeUndefined();
  });
});
