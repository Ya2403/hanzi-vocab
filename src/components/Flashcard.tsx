import { useEffect, useState, type MouseEvent } from 'react';
import { applyReview, formatInterval, Grade } from '../lib/srs';
import { getSettings, usePinyinVisibility } from '../lib/settings';
import { speak } from '../lib/speech';
import type { CardDirection, Word } from '../lib/types';
import { SpeakButton } from './SpeakButton';
import { Breakdown } from './Breakdown';
import { ExampleSentence, NotesBox } from './WordExtras';

interface Props {
  word: Word;
  direction: CardDirection;
  /** Show the four SM-2 grades with interval previews instead of a simple Again / Got it. */
  graded: boolean;
  onAnswer(quality: number): void;
}

export function Flashcard({ word, direction, graded, onAnswer }: Props) {
  const [flipped, setFlipped] = useState(false);
  const pv = usePinyinVisibility();
  const [revealed, setRevealed] = useState(false);

  const buttons = graded
    ? [
        { q: Grade.Again, label: 'Again', cls: 'again' },
        { q: Grade.Hard, label: 'Hard', cls: 'hard' },
        { q: Grade.Good, label: 'Good', cls: 'good' },
        { q: Grade.Easy, label: 'Easy', cls: 'easy' },
      ]
    : [
        { q: Grade.Again, label: 'Again', cls: 'again' },
        { q: Grade.Good, label: 'Got it', cls: 'good' },
      ];

  const flip = () => {
    if (flipped) return;
    setFlipped(true);
    if (getSettings().autoPlay) speak(word.hanzi);
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
        const idx = Number(e.key) - 1;
        if (buttons[idx]) onAnswer(buttons[idx].q);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Pinyin follows the setting for the side being shown; tapping the characters reveals it for this card.
  const pinyinShown = revealed || (flipped ? pv.answer : pv.question);
  const reveal = (e: MouseEvent) => {
    e.stopPropagation(); // reveal pinyin without flipping the card
    setRevealed(true);
  };
  const hanziTap = pinyinShown ? {} : { onClick: reveal, title: 'Tap to show pinyin' };
  const pinyinLine = pinyinShown ? (
    <span className="pinyin big">{word.pinyin}</span>
  ) : (
    <span className="reveal-hint">tap the characters for pinyin</span>
  );

  const front =
    direction === 'zh-en' ? (
      <>
        <div className={`prompt-hanzi ${pinyinShown ? '' : 'can-reveal'}`} lang="zh-CN" {...hanziTap}>
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
        <div className="card-kicker">{direction === 'zh-en' ? 'What does this mean?' : 'How do you say this in Chinese?'}</div>
        {front}
        {flipped ? (
          <div className="answer">
            <div className="answer-head">
              {direction === 'en-zh' && (
                <>
                  <span className={`answer-hanzi ${pinyinShown ? '' : 'can-reveal'}`} lang="zh-CN" {...hanziTap}>
                    {word.hanzi}
                  </span>
                  {pinyinLine}
                </>
              )}
              <SpeakButton text={word.hanzi} />
            </div>
            {direction === 'zh-en' && <div className="answer-meaning">{word.meaning}</div>}
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
        <div className={`grade-buttons n${buttons.length}`}>
          {buttons.map((b, i) => (
            <button key={b.label} className={`grade ${b.cls}`} onClick={() => onAnswer(b.q)}>
              <span>{b.label}</span>
              <small>{graded ? formatInterval(applyReview(word.srs, b.q).interval) : `key ${i + 1}`}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
