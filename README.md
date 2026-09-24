# Hanzi Vocab

A Chinese vocabulary trainer: React + Vite + TypeScript, installable as a PWA, with all data stored locally in IndexedDB.

## Features

- **Word list**: add, edit and delete words (hanzi, pinyin, meaning, optional example sentence, tags). Pinyin is generated automatically with `pinyin-pro` until you type your own. Search works with or without tone marks (`ni hao` finds 你好), and you can filter by tag.
- **Daily review**: SM-2 spaced repetition over the words due today. Flashcards grade Again / Hard / Good / Easy (qualities 1/3/4/5), and multiple choice grades Good or Again. Words you miss come back later in the same session, but only your first answer is graded.
- **Writing**: draw each character stroke by stroke with [Hanzi Writer](https://hanziwriter.org), which checks every stroke. After 3 misses on a stroke you get a hint. "Show strokes" animates the stroke order, and tracing mode shows a faint outline to draw over. The grade is automatic: no mistakes = Good, some mistakes or the demo = Hard, Reveal = Again. Stroke data comes from the jsDelivr CDN, one character at a time, and is kept in Cache Storage. Stats & data has a button to download it for your whole list, for offline use.
- **Free practice**: flashcards or multiple choice, 中→EN / EN→中 / mixed, filtered by tag. It doesn't change your review schedule.
- **Audio**: Web Speech API with a `zh-CN` voice. It can play automatically when an answer is revealed, and the speech rate is adjustable.
- **Streak**: any answered card counts for the day.
- **Bulk add**: copy the built-in prompt and give it to ChatGPT (or any AI chat) with a PDF, photo or list, then paste the reply back. The expected format is one word per line, `hanzi | pinyin | meaning | example | tags`. The parser also accepts markdown tables, tab-separated rows, numbered pinyin (`ni3 hao3`) and JSON. A preview shows new words, duplicates and unreadable lines before anything is saved.
- **Backup**: export and import JSON. Merge skips words whose hanzi you already have; Replace swaps out the whole list.
- **Keyboard shortcuts**: Space flips a card, 1–4 grades it or picks an option, and Enter continues.

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build with service worker
npm run preview   # serve the production build (test PWA install/offline here)
```

## Structure

```
src/
  lib/          data model and pure logic
    types.ts      Word / SrsState / streak types
    db.ts         IndexedDB (idb): `words` and `meta` stores
    srs.ts        SM-2 scheduling
    streak.ts, date.ts, pinyin.ts, speech.ts, io.ts, settings.ts
  store.tsx     React context wrapping the DB (words, streak, daily count)
  components/   Flashcard, MultipleChoice, Session (queue/grading), WordForm, …
  screens/      Words, Review, Practice, Stats & data
```

Import format: `{ "words": [ { "hanzi": "猫", "meaning": "cat", "tags": ["animals"] } ] }`. Only `hanzi` and `meaning` are required. Missing pinyin is generated, and missing SRS data starts as a new card.
