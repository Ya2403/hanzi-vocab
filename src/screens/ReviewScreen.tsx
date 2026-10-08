import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { formatDate, today } from '../lib/date';
import { learnedToday } from '../lib/learn';
import { pickPractice, reviewCount as countCards } from '../lib/planner';
import { isDueLearned, isLearned, isNew, nextDue } from '../lib/srs';
import { liveStreak } from '../lib/streak';
import { updateSettings, useSettings } from '../lib/settings';
import type { Sentence, Word } from '../lib/types';
import { isSentenceLearned, learnGroups, nextReadyGroup, sentencesLearnedToday } from '../lib/sentenceLearn';
import { isSentenceDue, pickSentencePractice, practiceSplit, sentenceNextDue, sentenceReviewCount } from '../lib/sentenceReview';
import { LearnSentenceSession } from '../components/LearnSentenceSession';
import { Session } from '../components/Session';
import { LearnSession } from '../components/LearnSession';
import { modeAvailable, SessionOptions } from '../components/SessionOptions';
import { TagFilter } from '../components/TagFilter';
import { tagLabel, wordsInTags } from '../components/TagPicker';

type Flow =
  | { phase: 'home' }
  | { phase: 'review'; words: Word[]; sentences: Sentence[]; title: string; chain: boolean }
  | { phase: 'learn' }
  | { phase: 'learnSentences' }
  | { phase: 'done' }
  | { phase: 'practice'; words: Word[]; sentences: Sentence[] };

/**
 * Home of the app. "Continue" runs everything due today in order: reviews (words, then
 * sentences), new words (up to the daily limit), new sentences (a ready dialogue or group),
 * then "Done for today" with an optional extra practice round.
 */
export function ReviewScreen({ onGoToWords, onGoToLearn }: { onGoToWords(): void; onGoToLearn(): void }) {
  const { words, sentences, dialogues, links, streak, daily } = useStore();
  const settings = useSettings();
  const [flow, setFlow] = useState<Flow>({ phase: 'home' });
  const [tags, setTags] = useState<string[]>([]);

  const on = today();
  const allDue = useMemo(() => words.filter((w) => isDueLearned(w, on, settings.writingPractice)), [words, on, settings.writingPractice]);
  const newWords = useMemo(() => words.filter(isNew), [words]);
  const newLeft = Math.min(newWords.length, Math.max(0, settings.learnDailyLimit - learnedToday(words, on)));
  const learnedWords = words.filter(isLearned);
  const filteredDue = wordsInTags(allDue, tags);
  const dueSentences = useMemo(() => sentences.filter((x) => isSentenceDue(x, on)), [sentences, on]);
  const filteredSentences = tags.length ? dueSentences.filter((x) => x.tags.some((t) => tags.includes(t))) : dueSentences;
  const sentenceCards = sentenceReviewCount(dueSentences, on);
  const learnedSentences = sentences.filter(isSentenceLearned);
  // The next new sentences to learn (a ready dialogue or group that fits today's limit).
  const sentencePlan = useMemo(
    () =>
      nextReadyGroup(
        learnGroups(sentences, dialogues),
        links,
        settings.sentenceReadyPercent,
        settings.sentenceDailyLimit - sentencesLearnedToday(sentences, on),
        sentencesLearnedToday(sentences, on),
      ),
    [sentences, dialogues, links, settings.sentenceReadyPercent, settings.sentenceDailyLimit, on],
  );
  const newSentences = sentencePlan?.sentences.filter((x) => !isSentenceLearned(x)).length ?? 0;
  const reviewedToday = daily.date === on ? daily.reviews : 0;
  // Review cards: meaning + pinyin share one, recall and writing get their own.
  const reviewCount = useMemo(() => countCards(allDue, on), [allDue, on]) + sentenceCards; // allDue already reflects writingPractice
  const filteredCount = countCards(filteredDue, on) + sentenceReviewCount(filteredSentences, on);
  const mode = settings.autoExercise ? 'auto' : settings.reviewMode;

  const nextUp = useMemo(() => {
    const upcoming = [
      ...words.filter((w) => isLearned(w) && !isDueLearned(w, on)).map((w) => nextDue(w, on)!),
      ...sentences.filter((x) => isSentenceLearned(x) && !isSentenceDue(x, on)).map((x) => sentenceNextDue(x, on)!),
    ].sort();
    if (!upcoming.length) return null;
    return { date: upcoming[0], count: upcoming.filter((d) => d === upcoming[0]).length };
  }, [words, sentences, on, settings.writingPractice]);

  const home = () => setFlow({ phase: 'home' });
  /** After new words: new sentences (if a group is ready), else done. */
  const afterWords = () => setFlow(sentencePlan ? { phase: 'learnSentences' } : { phase: 'done' });
  /** After reviews: new words (if any left today), then sentences, else done. */
  const afterReviews = () => (newLeft > 0 ? setFlow({ phase: 'learn' }) : afterWords());
  const split = practiceSplit(settings.practiceSize, learnedWords.length, learnedSentences.length, settings.practiceSentences);
  const practiceMore = () =>
    setFlow({ phase: 'practice', words: pickPractice(learnedWords, split.words), sentences: pickSentencePractice(learnedSentences, split.sentences) });

  const continueFlow = () => {
    if (allDue.length || dueSentences.length) setFlow({ phase: 'review', words: allDue, sentences: dueSentences, title: 'Reviews', chain: true });
    else afterReviews();
  };
  const nextLabel = newLeft > 0 ? `Continue: ${newLeft} new word${newLeft === 1 ? '' : 's'}` : sentencePlan ? `Continue: ${sentencePlan.group.title}` : 'Continue';

  // ---------- Running phases ----------

  if (flow.phase === 'review') {
    return (
      <Session
        title={flow.title}
        words={flow.words}
        sentences={flow.sentences}
        mode={mode}
        direction={settings.reviewDirection}
        updateSchedule
        onExit={home}
        onFinish={flow.chain ? afterReviews : home}
        finishLabel={flow.chain ? nextLabel : 'Done'}
      />
    );
  }
  if (flow.phase === 'learn') {
    return (
      <LearnSession
        pool={newWords}
        title="New words"
        onExit={home}
        onFinish={afterWords}
        finishLabel={sentencePlan ? `Continue: ${sentencePlan.group.title}` : 'Continue'}
      />
    );
  }
  if (flow.phase === 'learnSentences') {
    if (!sentencePlan) {
      setFlow({ phase: 'done' });
      return null;
    }
    const g = sentencePlan.group;
    return (
      <LearnSentenceSession
        title={g.title}
        lines={sentencePlan.sentences.map((x) => ({ sentence: x, speaker: g.speakers.get(x.id) }))}
        isDialogue={sentencePlan.isDialogue}
        onExit={home}
        onFinish={() => setFlow({ phase: 'done' })}
        finishLabel="Continue"
      />
    );
  }
  if (flow.phase === 'practice') {
    return (
      <Session
        title="Practice more"
        words={flow.words}
        sentences={flow.sentences}
        mode={settings.autoExercise ? 'auto' : settings.practiceMode}
        direction={settings.practiceDirection}
        updateSchedule={false}
        onExit={home}
      />
    );
  }
  if (flow.phase === 'done') {
    return (
      <section className="screen">
        <div className="card summary done-today">
          <div className="summary-score">🎉</div>
          <h2>Done for today</h2>
          <p className="muted">
            {reviewedToday} answers today · 🔥 {liveStreak(streak, on)} day streak
            {nextUp && ` · next reviews ${formatDate(nextUp.date)}`}
          </p>
          <div className="row center">
            <button className="btn primary" onClick={practiceMore} disabled={!split.words && !split.sentences} autoFocus>
              Practice more ({split.words + split.sentences})
            </button>
            <button className="btn" onClick={home}>
              Back
            </button>
          </div>
          <p className="hint">Practice more picks your weakest words and sentences. It doesn’t change their schedule, except that a miss brings a review forward.</p>
        </div>
      </section>
    );
  }

  // ---------- Home ----------

  const nothingLeft = !allDue.length && !dueSentences.length && newLeft === 0 && !sentencePlan;

  return (
    <section className="screen">
      <div className="card hero continue-card">
        {words.length === 0 ? (
          <>
            <h2>Welcome!</h2>
            <p className="muted">Add some words to get started.</p>
            <button className="btn primary block" onClick={onGoToWords}>
              Go to word list
            </button>
          </>
        ) : (
          <>
            <p className="continue-summary">
              <b>{reviewCount}</b> review{reviewCount === 1 ? '' : 's'} · <b>{newLeft}</b> new word{newLeft === 1 ? '' : 's'}
              {newSentences > 0 && (
                <>
                  {' '}
                  · <b>{newSentences}</b> new sentence{newSentences === 1 ? '' : 's'}
                </>
              )}{' '}
              left today
            </p>
            <button className="btn primary continue-btn" onClick={nothingLeft ? () => setFlow({ phase: 'done' }) : continueFlow}>
              {nothingLeft ? 'All done for today ✓' : 'Continue'}
            </button>
            <div className="hero-stats">
              <div>
                <div className="stat-value">{reviewedToday}</div>
                <div className="stat-label">answered today</div>
              </div>
              <div>
                <div className="stat-value">🔥 {liveStreak(streak, on)}</div>
                <div className="stat-label">day streak</div>
              </div>
              <div>
                <div className="stat-value">{learnedWords.length}</div>
                <div className="stat-label">learned words</div>
              </div>
            </div>
            {nothingLeft && nextUp && (
              <p className="muted small">
                Next: {nextUp.count} review{nextUp.count > 1 ? 's' : ''} on {formatDate(nextUp.date)}.
                {newWords.length > 0 && ` ${newWords.length} new words wait in Learn (daily limit reached).`}
              </p>
            )}
            {newWords.length > 0 && (
              <button className="link-btn" onClick={onGoToLearn}>
                Learn tab: pick which new words to learn →
              </button>
            )}
          </>
        )}
      </div>

      {learnedWords.length > 0 && (
        <div className="card form setup-card">
          <div className="setup-col">
            <h2>Review a selection</h2>
            <TagFilter words={words} selected={tags} onChange={setTags} showDue />
            <button
              className="btn block"
              disabled={(!filteredDue.length && !filteredSentences.length) || (!settings.autoExercise && !modeAvailable(settings.reviewMode, words.length))}
              onClick={() =>
                setFlow({
                  phase: 'review',
                  words: filteredDue,
                  sentences: filteredSentences,
                  title: tags.length ? `Review · ${tags.map(tagLabel).join(', ')}` : 'Reviews',
                  chain: false,
                })
              }
            >
              {filteredCount
                ? `Review ${filteredCount} due (${[filteredDue.length && `${filteredDue.length} word${filteredDue.length === 1 ? '' : 's'}`, filteredSentences.length && `${filteredSentences.length} sentence${filteredSentences.length === 1 ? '' : 's'}`].filter(Boolean).join(', ')})`
                : tags.length
                  ? 'Nothing due in this selection'
                  : 'Nothing due'}
            </button>
          </div>
          <div className="setup-col">
            <label className="toggle">
              <input type="checkbox" checked={settings.autoExercise} onChange={(e) => updateSettings({ autoExercise: e.target.checked })} />
              <span>Choose exercises automatically</span>
            </label>
            {settings.autoExercise ? (
              <p className="hint">
                Meaning and pinyin are asked together (the meaning first, then the pronunciation), recall on its own card. Each part is multiple choice until you know it well, then typing; medium pinyin sometimes gets listening.
              </p>
            ) : (
              <SessionOptions
                mode={settings.reviewMode}
                direction={settings.reviewDirection}
                onMode={(reviewMode) => updateSettings({ reviewMode })}
                onDirection={(reviewDirection) => updateSettings({ reviewDirection })}
                totalWords={words.length}
              />
            )}
          </div>
        </div>
      )}

      <LearnProgress words={words} />
    </section>
  );
}

/** Learned / total per category, e.g. "HSK lesson 1: 24/86 learned". */
function LearnProgress({ words }: { words: Word[] }) {
  const rows = useMemo(() => {
    const tags = [...new Set(words.flatMap((w) => w.tags))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return tags.map((t) => {
      const inTag = words.filter((w) => w.tags.includes(t));
      return { tag: t, total: inTag.length, learned: inTag.filter(isLearned).length };
    });
  }, [words]);
  if (!rows.length) return null;
  return (
    <div className="card learn-progress">
      <h2>Learn progress</h2>
      <ul>
        {rows.map((r) => (
          <li key={r.tag}>
            <span className="lp-tag">{r.tag}</span>
            <span className="lp-bar" aria-hidden="true">
              <span style={{ width: `${(r.learned / r.total) * 100}%` }} />
            </span>
            <span className="lp-count small">
              {r.learned}/{r.total} learned
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
