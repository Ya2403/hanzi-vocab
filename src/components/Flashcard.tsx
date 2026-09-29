import { autoSpeak } from '../lib/quiet';
import { useEffect, useState, type MouseEvent } from 'react';
import { Grade, SKILL_LABEL } from '../lib/srs';
import { usePinyinVisibility, useSettings } from '../lib/settings';
import type { CardDirection, Skill, Word } from '../lib/types';
import { SpeakButton } from './SpeakButton';
import { Breakdown } from './Breakdown';
import { ExampleSentence, NotesBox } from './WordExtras';

interface Props {
  word: Word;
  direction: CardDirection;
  /** The skills this card tests: one grade row each (hanzi side: meaning + pinyin; English side: recall). */
  skills: Skill[];
  onAnswer(grades: Partial<Record<Skill, number>>, toneError: boolean): void;
}

interface RowButton {
  q: number;
  label: string;
  cls: string;
  toneError?: boolean;
}

export function Flashcard({ word, direction, skills, onAnswer }: Props) {
  const [flipped, setFlipped] = useState(false);
  const pv = usePinyinVisibility(direction);
  const { tones } = useSettings();
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<Partial<Record<Skill, RowButton>>>({});

  const rowButtons = (k: Skill): RowButton[] => [
    { q: Grade.Again, label: 'Forgot', cls: 'again' },
    ...(k === 'pinyin' && tones !== 'ignore'
      ? [{ q: tones === 'required' ? Grade.Hard : Grade.Good, label: 'Wrong tone', cls: 'hard', toneError: true }]
      : []),
    { q: Grade.Good, label: 'Knew it', cls: 'good' },
  ];
  // Keyboard: 1, 2 (3) for the first row, then the next numbers for the second.
  const keyed = skills.flatMap((k) => rowButtons(k).map((b) => ({ k, b })));

  const choose = (k: Skill, b: RowButton) => {
    const next = { ...picked, [k]: b };
    setPicked(next);
    if (skills.every((x) => next[x])) {
      const grades: Partial<Record<Skill, number>> = {};
      for (const x of skills) grades[x] = next[x]!.q;
      onAnswer(grades, skills.some((x) => next[x]!.toneError));
    }
  };

  const flip = () => {
    if (flipped) return;
    setFlipped(true);
    autoSpeak(word.hanzi);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      // Leave keys alone while a popup (e.g. "Words with X") is open.
      if (document.querySelector('.modal-backdrop')) return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        flip();
      } else if (flipped) {
        const hit = keyed[Number(e.key) - 1];
        if (hit) choose(hit.k, hit.b);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Pinyin follows the setting for the side being shown; tapping the characters reveals it for this card.
  const pinyinShown = flipped ? revealed || pv.answer || skills.includes('pinyin') : !skills.includes('pinyin') && (revealed || pv.question);
  const reveal = (e: MouseEvent) => {
    e.stopPropagation(); // reveal pinyin without flipping the card
    setRevealed(true);
  };
  // In 中 → 拼音 the pinyin is the answer: tapping flips the card instead of revealing it.
  // When pinyin is tested it can't be revealed early, and the front never shows it.
  const testsPinyin = skills.includes('pinyin');
  const canReveal = !pinyinShown && direction !== 'zh-py' && !testsPinyin;
  const hanziTap = canReveal ? { onClick: reveal, title: 'Tap to show pinyin' } : {};
  const pinyinLine = pinyinShown ? (
    <span className="pinyin big">{word.pinyin}</span>
  ) : canReveal ? (
    <span className="reveal-hint">tap the characters for pinyin</span>
  ) : null;

  const front =
    direction !== 'en-zh' ? (
      <>
        <div className={`prompt-hanzi ${canReveal ? 'can-reveal' : ''}`} lang="zh-CN" {...hanziTap}>
          {word.hanzi}
        </div>
        {pinyinLine}
      </>
    ) : (
      <div className="prompt-meaning">{word.meaning}</div>
    );

  return (
    <div className="practice">
      <div className={`flashcard card ${flipped ? 'flipped' : ''}`} onClick={flip} role="button" tabIndex={0} aria-label={flipped ? 'Card answer' : 'Reveal answer'}>
        <div className="card-kicker">
          {direction === 'zh-en' ? 'What does this mean?' : direction === 'zh-py' ? 'How is this pronounced?' : 'How do you say this in Chinese?'}
        </div>
        {front}
        {flipped ? (
          <div className="answer">
            <div className="answer-head">
              {direction === 'en-zh' && (
                <>
                  <span className={`answer-hanzi ${canReveal ? 'can-reveal' : ''}`} lang="zh-CN" {...hanziTap}>
                    {word.hanzi}
                  </span>
                  {pinyinLine}
                </>
              )}
              <SpeakButton text={word.hanzi} />
            </div>
            {direction !== 'en-zh' && <div className="answer-meaning">{word.meaning}</div>}
            <NotesBox notes={word.notes} />
            {word.example && (
              <ExampleSentence text={word.example} pinyinVisible={pv.question} translation={word.exampleTranslation} tatoebaId={word.exampleRef} />
            )}
            <Breakdown word={word} collapsible pinyinVisible={pinyinShown} />
          </div>
        ) : (
          <div className="tap-hint">Tap or press Space to reveal</div>
        )}
      </div>

      {flipped && (
        <div className="grade-rows">
          {(() => {
            let n = 0;
            return skills.map((k) => (
              <div key={k} className="grade-row">
                <span className="grade-row-label">{SKILL_LABEL[k]}</span>
                <div className={`grade-buttons n${rowButtons(k).length}`}>
                  {rowButtons(k).map((b) => (
                    <button
                      key={b.label}
                      className={`grade ${b.cls} ${picked[k] ? (picked[k]!.label === b.label ? 'picked' : 'dim') : ''}`}
                      onClick={() => choose(k, b)}
                    >
                      <span>{b.label}</span>
                      <small>key {++n}</small>
                    </button>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
