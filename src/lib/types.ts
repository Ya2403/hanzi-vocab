/**
 * What a review can test about a word. Each skill has its own SM-2 schedule:
 * meaning (hanzi → meaning), pinyin (hanzi → pinyin), recall (meaning → hanzi),
 * writing (draw from memory; only with the "Writing practice" setting).
 */
export type Skill = 'meaning' | 'pinyin' | 'recall' | 'writing';
export const SKILLS: Skill[] = ['meaning', 'pinyin', 'recall', 'writing'];

/** SM-2 scheduling state and answer statistics of one skill. */
export interface SkillState {
  /** Easiness factor, >= 1.3. */
  ease: number;
  /** Current interval in days. */
  interval: number;
  /** Consecutive successful reviews. */
  reps: number;
  /** Times the skill was graded Again after it had graduated (interval ≥ 1 day). */
  lapses: number;
  /** Local date (YYYY-MM-DD) on which the skill is next due. */
  due: string;
  /** Local date of the last graded review. */
  lastReviewed?: string;
  /** Flagged as a leech: forgotten `leechThreshold` times. */
  leech?: boolean;
  /** `lapses` when the user last unmarked the leech; only lapses after that count again. */
  lapsesAtUnmark?: number;
  /** Every answer in Review, Learn and Practice: totals, the last 5 results ("1" = right, newest last), time. */
  answered?: number;
  correct?: number;
  recent?: string;
  lastSeen?: number;
}

/** The SM-2 helpers work on any one skill's state. */
export type SrsState = SkillState;

/** A new word has no skills; learning it in Learn creates meaning, pinyin and recall. */
export type Skills = Partial<Record<Skill, SkillState>>;

export interface Word {
  id: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
  example?: string;
  /** English translation of the example (set when it came from Tatoeba). */
  exampleTranslation?: string;
  /** Tatoeba sentence id of the example, for attribution. */
  exampleRef?: number;
  /** Free-form notes or a memory trick (mnemonic). */
  notes?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  skills: Skills;
  /** Local date the word was learned in Learn mode. */
  learnedOn?: string;
  /** Pinyin answers with the right syllables but wrong tones. */
  toneErrors?: number;
}

/** Fields the user edits directly. */
export type WordInput = Pick<Word, 'hanzi' | 'pinyin' | 'meaning' | 'example' | 'exampleTranslation' | 'exampleRef' | 'notes' | 'tags'>;

export type PracticeMode = 'flashcards' | 'choice' | 'typing' | 'writing' | 'sentence';
/** zh-en: show Chinese, recall meaning. en-zh: show meaning, recall Chinese. zh-py: show Chinese, recall pinyin. */
export type CardDirection = 'zh-en' | 'en-zh' | 'zh-py';
export type Direction = CardDirection | 'mixed';

export interface StreakState {
  current: number;
  longest: number;
  /** Last local date with at least one answered card. */
  lastDate: string | null;
}

export interface DailyStats {
  date: string;
  reviews: number;
}
