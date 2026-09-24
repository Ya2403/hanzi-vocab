/** SM-2 scheduling state stored on every word. */
export interface SrsState {
  /** Easiness factor, >= 1.3. */
  ease: number;
  /** Current interval in days. */
  interval: number;
  /** Consecutive successful reviews. */
  reps: number;
  /** Times the word was forgotten after being learned. */
  lapses: number;
  /** Local date (YYYY-MM-DD) on which the word is next due. */
  due: string;
  /** Local date of the last graded review. */
  lastReviewed?: string;
}

export interface Word {
  id: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
  example?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  srs: SrsState;
}

/** Fields the user edits directly. */
export type WordInput = Pick<Word, 'hanzi' | 'pinyin' | 'meaning' | 'example' | 'tags'>;

export type PracticeMode = 'flashcards' | 'choice' | 'typing' | 'writing';
/** zh-en: show Chinese, recall meaning. en-zh: show meaning, recall Chinese. */
export type CardDirection = 'zh-en' | 'en-zh';
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
