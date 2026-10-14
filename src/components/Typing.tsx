import { useState } from 'react';
import { autoSpeak } from '../lib/quiet';
import { missedChars } from '../lib/typedChinese';
import type { Word } from '../lib/types';
import { TypedChinese, typedGrade } from './ContextCards';
import { ItemReveal } from './TypedCards';

interface Props {
  word: Word;
  /** `wrongChars`: the characters of the answer that were typed wrong or left out (a wrong answer). */
  onAnswer(quality: number, wrongChars?: string[]): void;
}

/**
 * English → characters for a word or character: see the meaning, type the Chinese with the
 * phone's Chinese keyboard. Exact = correct; one wrong character in 6+ = Almost (Hard);
 * otherwise wrong, with the comparison and "I was right".
 */
export function Typing({ word, onAnswer }: Props) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="practice">
      <div className="card prompt-card">
        <div className="card-kicker">Type the Chinese characters</div>
        <div className="prompt-meaning">{word.meaning}</div>
        {checked && <ItemReveal word={word} />}
      </div>
      <TypedChinese
        expected={word.hanzi}
        placeholder="汉字"
        onChecked={() => {
          setChecked(true);
          autoSpeak(word.hanzi);
        }}
        onDone={(r) => onAnswer(typedGrade(r.verdict, r.override), r.verdict === 'correct' || r.override ? undefined : missedChars(r.check.parts))}
      />
    </div>
  );
}
