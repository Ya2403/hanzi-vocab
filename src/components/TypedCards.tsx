import { useEffect, useRef, useState, type ReactNode } from 'react';
import { speak } from '../lib/speech';
import { missedChars, wordResults, type TypedVerdict } from '../lib/typedChinese';
import { Grade, isLearned } from '../lib/srs';
import { autoSpeak } from '../lib/quiet';
import { usePinyinVisibility } from '../lib/settings';
import type { Sentence, Word } from '../lib/types';
import { isWordEntry } from '../lib/entries';
import { TypedChinese, typedGrade, type ContextResult } from './ContextCards';
import { SentenceReveal } from './SentenceExercises';
import { CharFormula } from './Entries';
import { HanziText } from './HanziText';
import { Icon } from './Icon';
import { SpeakButton } from './SpeakButton';

/** Slow play speed for dictation. */
const SLOW = 0.55;

/**
 * Dictation prompt: no text, only Play and Slow play (it plays once by itself). "Can't listen
 * now" skips the card and pauses listening exercises.
 */
export function DictationPrompt({ text, kicker, onCantListen, answered }: { text: string; kicker: string; onCantListen?(): void; answered: boolean }) {
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    speak(text); // dictation: always play, regardless of auto-play
  }, [text]);
  return (
    <>
      <div className="card-kicker">{kicker}</div>
      <div className="row center dictation-buttons">
        <button type="button" className="btn listen-btn" onClick={() => speak(text)} aria-label="Play">
          <Icon name="speaker" size={30} />
        </button>
        <button type="button" className="btn slow-btn" onClick={() => speak(text, SLOW)} aria-label="Play slowly">
          🐢 Slow
        </button>
      </div>
      {!answered && onCantListen && (
        <button type="button" className="btn ghost cant-listen" onClick={onCantListen}>
          <Icon name="headphonesOff" size={18} /> Can’t listen now
        </button>
      )}
    </>
  );
}

/** A word or character's full answer: characters, pinyin, meaning, audio, and its characters as chips. */
export function ItemReveal({ word }: { word: Word }) {
  const pv = usePinyinVisibility('en-zh');
  return (
    <div className="word-reveal">
      <div className="answer-head">
        <span className="answer-hanzi small-hanzi" lang="zh-CN">
          <HanziText text={word.hanzi} />
        </span>
        {pv.answer && <span className="pinyin">{word.pinyin}</span>}
        <SpeakButton text={word.hanzi} />
      </div>
      <div>{word.meaning}</div>
      {isWordEntry(word) && <CharFormula word={word} />}
    </div>
  );
}

/**
 * Dictation of a character or word (pinyin skill): hear it, type it. Characters with the same
 * reading (是 / 事) count as right.
 */
export function Dictation({ word, onAnswer, onCantListen }: { word: Word; onAnswer(q: number, wrongChars?: string[]): void; onCantListen(): void }) {
  const [checked, setChecked] = useState(false);
  return (
    <DictationCard
      text={word.hanzi}
      kicker="Dictation: type what you hear"
      sameSound
      onCantListen={onCantListen}
      checked={checked}
      onChecked={() => setChecked(true)}
      reveal={<ItemReveal word={word} />}
      onDone={(r) => onAnswer(typedGrade(r.verdict, r.override), r.verdict === 'correct' || r.override ? undefined : missedChars(r.check.parts))}
    />
  );
}

export function DictationCard({
  text,
  kicker,
  sameSound,
  onCantListen,
  checked,
  onChecked,
  reveal,
  onDone,
}: {
  text: string;
  kicker: string;
  sameSound?: boolean;
  onCantListen?(): void;
  checked: boolean;
  onChecked(): void;
  reveal: ReactNode;
  onDone: Parameters<typeof TypedChinese>[0]['onDone'];
}) {
  return (
    <div className="practice">
      <div className="card prompt-card">
        <DictationPrompt text={text} kicker={kicker} onCantListen={onCantListen} answered={checked} />
        {checked && reveal}
      </div>
      <TypedChinese expected={text} sameSound={sameSound} placeholder="汉字" onChecked={onChecked} onDone={onDone} />
    </div>
  );
}


/** Grade a typed sentence: the target on its own characters ("Almost" on them is Hard), the other items right or wrong. */
function sentenceResult(r: { verdict: TypedVerdict; typed: string; override: boolean }, s: Sentence, word: Word, linked: Word[]): ContextResult {
  const items = [word, ...linked.filter((w) => w.id !== word.id && isLearned(w))];
  const allRight = r.override || r.verdict === 'correct';
  const res = allRight ? new Map(items.map((w) => [w.id, true])) : wordResults(s.zh, r.typed, items);
  const targetOk = allRight || res.get(word.id) === true;
  res.delete(word.id);
  return { q: targetOk ? Grade.Good : r.verdict === 'almost' ? Grade.Hard : Grade.Again, others: res };
}

/** English → characters for a sentence or dialogue line: see the English, type the Chinese. */
export function TypeSentence({ s, word, linked, onAnswer }: { s: Sentence; word: Word; linked: Word[]; onAnswer(r: ContextResult): void }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="practice sentence-practice">
      <div className="card prompt-card">
        <div className="card-kicker">Type it in Chinese</div>
        <div className="prompt-meaning">{s.translation}</div>
        {checked && <SentenceReveal sentence={s} />}
      </div>
      <TypedChinese
        expected={s.zh}
        alternatives={s.alternatives}
        placeholder="汉字"
        onChecked={() => {
          setChecked(true);
          autoSpeak(s.zh);
        }}
        onDone={(r) => onAnswer(sentenceResult(r, s, word, linked))}
      />
    </div>
  );
}

/** Dictation of a sentence (pinyin skill of the target): hear it, type it. */
export function SentenceDictation({ s, word, linked, onAnswer, onCantListen }: { s: Sentence; word: Word; linked: Word[]; onAnswer(r: ContextResult): void; onCantListen?(): void }) {
  const [checked, setChecked] = useState(false);
  return (
    <DictationCard
      text={s.zh}
      kicker="Dictation: type what you hear"
      onCantListen={onCantListen}
      checked={checked}
      onChecked={() => setChecked(true)}
      reveal={<SentenceReveal sentence={s} />}
      onDone={(r) => onAnswer(sentenceResult(r, s, word, linked))}
    />
  );
}
