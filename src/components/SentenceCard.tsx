import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { isQuiet } from '../lib/quiet';
import { buildTiles, responseOptions, translationOptions } from '../lib/sentenceLearn';
import { clozeCandidates, clozeOptions, clozeTarget, type SentenceContext, type SentenceStep } from '../lib/sentenceReview';
import { isLearned } from '../lib/srs';
import type { Sentence } from '../lib/types';
import { listeningAvailable } from './LearnCards';
import { BuildSentence, ClozeChoice, DialogueResponse, TranslationChoice } from './SentenceExercises';

export interface SentencePlace {
  /** Sentences for distractors: its dialogue, or sentences sharing its first tag. */
  near: Sentence[];
  /** Dialogue lines (in order) and this sentence's position, if it's a dialogue line. */
  lines?: Sentence[];
  index?: number;
  speakers?: Map<string, string | undefined>;
}

/** Everything sentence exercises need to know about where a sentence sits. */
export function useSentenceWorld() {
  const { sentences, dialogues, words, links } = useStore();
  return useMemo(() => {
    const byId = new Map(sentences.map((s) => [s.id, s]));
    const translated = sentences.filter((s) => s.translation.trim());
    const place = new Map<string, SentencePlace>();
    for (const d of dialogues) {
      const lines = d.lines.map((l) => byId.get(l.sentenceId)).filter((s): s is Sentence => !!s && !!s.translation.trim());
      const speakers = new Map(d.lines.map((l) => [l.sentenceId, l.speaker]));
      lines.forEach((s, index) => place.set(s.id, { near: lines, lines, index, speakers }));
    }
    const byTag = new Map<string, Sentence[]>();
    for (const s of translated) if (s.tags[0]) byTag.set(s.tags[0], [...(byTag.get(s.tags[0]) ?? []), s]);
    const placeOf = (s: Sentence): SentencePlace => place.get(s.id) ?? { near: s.tags[0] ? (byTag.get(s.tags[0]) ?? []) : [] };
    const known = new Set(words.map((w) => w.hanzi.trim()));
    const learnedWords = words.filter(isLearned);
    const contextOf = (s: Sentence): SentenceContext => {
      const p = placeOf(s);
      return {
        listening: listeningAvailable && !isQuiet(),
        canRespond: p.index !== undefined && p.index > 0 && (p.lines?.length ?? 0) > 2,
        canCloze: clozeCandidates(s, links.bySentence.get(s.id) ?? []).length > 0,
      };
    };
    return { byId, translated, placeOf, contextOf, known, learnedWords, links };
  }, [sentences, dialogues, words, links]);
}

/** One review/practice card for a sentence. Options are drawn once per card. */
export function SentenceCard({ step, sentence: s, onAnswer, onCantListen }: { step: SentenceStep; sentence: Sentence; onAnswer(q: number): void; onCantListen(): void }) {
  const world = useSentenceWorld();
  const [setup] = useState(() => {
    const p = world.placeOf(s);
    const others = world.translated;
    let ex = step.ex;
    if (ex === 'cloze') {
      const target = clozeTarget(s, world.links.bySentence.get(s.id) ?? []);
      if (target) return { ex, target, words: clozeOptions(target, s, world.learnedWords) };
      ex = 'build';
    }
    if (ex === 'response' && p.lines && p.index && p.index > 0 && p.lines.length > 2) {
      return { ex, lines: p.lines, index: p.index, speakers: p.speakers, options: responseOptions(p.lines, p.index, 3) };
    }
    if (ex === 'response') ex = 'translate';
    if (ex === 'build') return { ex, ...buildTiles(s, p.near.length > 2 ? p.near : others, Math.random, world.known) };
    return { ex, translations: translationOptions(s, p.near, others, 4) };
  });

  switch (setup.ex) {
    case 'cloze':
      return <ClozeChoice sentence={s} target={setup.target!} options={setup.words!} onAnswer={onAnswer} />;
    case 'response':
      return (
        <DialogueResponse
          prompt={setup.lines![setup.index! - 1]}
          promptSpeaker={setup.speakers?.get(setup.lines![setup.index! - 1].id)}
          answer={s}
          options={setup.options!}
          onAnswer={onAnswer}
        />
      );
    case 'build':
      return <BuildSentence sentence={s} tiles={setup.tiles!} answer={setup.answer!} onAnswer={onAnswer} />;
    default:
      return (
        <TranslationChoice
          sentence={s}
          options={setup.translations!}
          audioOnly={setup.ex === 'listen'}
          onAnswer={onAnswer}
          onCantListen={setup.ex === 'listen' ? onCantListen : undefined}
        />
      );
  }
}
