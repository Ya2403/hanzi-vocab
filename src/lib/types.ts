/** SM-2 scheduling state stored on every word. */
export interface SrsState {
  /** Easiness factor, >= 1.3. */
  ease: number;
  /** Current interval in days. */
  interval: number;
  /** Consecutive successful reviews. */
  reps: number;
  /** Times the word was graded Again after it had graduated (interval ≥ 1 day). */
  lapses: number;
  /** Flagged as a leech: forgotten `leechThreshold` times. */
  leech?: boolean;
  /** `lapses` when the user last unmarked the leech; only lapses after that count again. */
  lapsesAtUnmark?: number;
  /** Local date (YYYY-MM-DD) on which the word is next due. */
  due: string;
  /** Local date of the last graded review. */
  lastReviewed?: string;
  /** Successful (Hard/Good/Easy) reviews in total; unlocks the extra writing card in Review. */
  successes?: number;
  /** Local date the word was learned in Learn mode. */
  learnedOn?: string;
}

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
  srs: SrsState;
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
