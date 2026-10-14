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
  /** FSRS card (see fsrs.ts). Skills without it still have only SM-2 data, converted when used. */
  fsrs?: FsrsData;
}

/** A skill's FSRS card: stability, difficulty, state, last review and due time (ms), counts. */
export interface FsrsData {
  s: number;
  d: number;
  state: number;
  last: number;
  due: number;
  reps: number;
  lapses: number;
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
  /**
   * Legacy: before Sentence items, a word had one example sentence here. Words that still have
   * one (old backups, devices on an older version) are migrated into Sentences linked to the word.
   */
  example?: string;
  exampleTranslation?: string;
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
  /** Character, word or name, when set by hand (otherwise detected, see entries.ts). */
  kind?: 'char' | 'word' | 'name';
  /** Words and names: answer statistics (they have no schedule). */
  stats?: WordStats;
  /** Words and names: the date all their characters were learned (unset while locked). */
  unlockedOn?: string;
  /** Words and names: their per-skill progress from before characters and words (kept, unused). */
  legacySkills?: Skills;
}

/** Background statistics of a word: accuracy, the last 5 results ("1" = right), when seen, "needs work". */
export interface WordStats {
  answered: number;
  correct: number;
  recent: string;
  lastSeen?: number;
  /** Right answers in a row (2 clear "needs work"). */
  okStreak?: number;
  /** Set by a miss or a lookup. */
  needsWork?: boolean;
}

/** Fields the user edits directly. */
export type WordInput = Pick<Word, 'hanzi' | 'pinyin' | 'meaning' | 'notes' | 'tags'> & Partial<Pick<Word, 'kind'>>;

/** A word as added by hand or in bulk; `example` becomes a Sentence linked to the word. */
export type NewWord = WordInput & { example?: string };

/** A Chinese sentence with its own translation (learned and reviewed like words, see Sentences). */
export interface Sentence {
  id: string;
  /** The sentence in Chinese characters. */
  zh: string;
  /** Generated from zh until edited. */
  pinyin: string;
  /** English translation; empty = needs translation. */
  translation: string;
  tags: string[];
  notes?: string;
  /** The dialogue this sentence is a line of. */
  dialogueId?: string;
  /** Words linked by hand (e.g. the word whose example it was), on top of the automatic links. */
  wordIds?: string[];
  /** Tatoeba sentence id, for attribution. */
  tatoebaId?: number;
  /** Other correct ways to say it (accepted when building or typing the sentence). */
  alternatives?: string[];
  /** Review schedules, set once the sentence is learned in Learn (none = new). */
  skills?: SentenceSkills;
  /** Local date the sentence was learned. */
  learnedOn?: string;
  createdAt: number;
  updatedAt: number;
}

/** understand: Chinese → meaning. produce: meaning → Chinese. */
export type SentenceSkill = 'understand' | 'produce';
export type SentenceSkills = Partial<Record<SentenceSkill, SkillState>>;

export type SentenceInput = Pick<Sentence, 'zh' | 'pinyin' | 'translation' | 'tags' | 'notes' | 'wordIds' | 'tatoebaId' | 'alternatives'>;

export interface DialogueLine {
  sentenceId: string;
  /** "A", "B" or a name; optional. */
  speaker?: string;
}

/** A lesson text: an ordered list of sentence lines with speakers. */
export interface Dialogue {
  id: string;
  /** e.g. "第一课 课文3" */
  title: string;
  tags: string[];
  lines: DialogueLine[];
  /** When it was last read through in the Reader (ms). */
  lastRead?: number;
  /** A daily reading (made by an AI chat from my words) rather than a lesson dialogue. */
  kind?: 'reading';
  /** Daily reading: the local date it was made for. */
  readingDate?: string;
  createdAt: number;
  updatedAt: number;
}

export type PracticeMode = 'flashcards' | 'choice' | 'typing' | 'writing';
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
