# Hanzi Vocab

A Chinese vocabulary trainer: React + Vite + TypeScript, installable as a PWA, with all data stored locally in IndexedDB.

## Features

- **Word list**: add, edit and delete words (hanzi, pinyin, meaning, optional example sentence, tags). Pinyin is generated automatically with `pinyin-pro` until you type your own. Search works with or without tone marks (`ni hao` finds 你好), and you can filter by tag.
- **Daily review**: SM-2 spaced repetition over the words due today. Flashcards grade Again / Hard / Good / Easy (qualities 1/3/4/5), and multiple choice grades Good or Again. Words you miss come back later in the same session, but only your first answer is graded.
- **Typing**: type the answer from the keyboard. For 中 → EN, type the meaning: any one sense counts, and case, "to"/"a"/"the" and small typos are forgiven. For EN → 中, type hanzi or pinyin, with tone marks (`nǐ hǎo`), numbers (`ni3hao3`, `5` = neutral) or `v` for ü. Right syllables with wrong or missing tones count as "close" (Hard). An "I was right" button overrides a wrong verdict.
- **Character breakdown**: tap a word to open its detail view, or expand "Breakdown" on a flashcard back. For each character you see its components with their meanings, the radical, and the etymology, e.g. 好 = 女 + 子, "A woman 女 with a son 子". For meaning + sound characters, the parts are labelled (妈: 女 gives the meaning, 马 mǎ gives the sound). Tap a component to see other words in your list that contain it. The data, from Make Me a Hanzi, loads the first time it's needed and is cached for offline use.
- **Notes & leeches**: every word has an optional "Notes / mnemonic" field, shown in the editor, the detail view and on flashcard backs, and included in export/import. A lapse is an Again on a word that had graduated (interval ≥ 1 day). When a word reaches the leech threshold (Settings, default 5 lapses), a prompt offers to add a memory trick right away. Leeches get a 🐛 badge, a filter chip in the word list and a source option in free Practice. The editor has Reset progress and Unmark leech (after unmarking, a full threshold of new lapses is needed to flag it again).
- **Pinyin visibility**: hide pinyin on practice question sides and under example sentences (Settings switch, or the 拼音 button in a session). Tap the characters or a sentence to reveal it for that card. "Show pinyin after answering" (on by default) still shows it on the answer side. The word list has its own toggle. Writing mode keeps pinyin, since it is part of the prompt.
- **Categories**: Review and Practice can both be limited to one tag. Selecting a tag in the word list shows a "Practice this tag" shortcut.
- **Writing**: draw each character stroke by stroke with [Hanzi Writer](https://hanziwriter.org), which checks every stroke. After 3 misses on a stroke you get a hint. "Show strokes" animates the stroke order, and tracing mode shows a faint outline to draw over. The grade is automatic: no mistakes = Good, some mistakes or the demo = Hard, Reveal = Again. Stroke data comes from the jsDelivr CDN, one character at a time, and is kept in Cache Storage. Stats & data has a button to download it for your whole list, for offline use.
- **Free draw** (second writing style; switch in the session options or with the toggle on the card): draw the whole character in any order, then tap **Check**. Undo stroke and Clear are available. Your strokes are paired with the reference stroke medians regardless of order (Hungarian matching on shape, position, direction and length, after aligning your drawing to the reference). You get a percentage and **Correct / Close / Wrong**, and your drawing is shown over the correct character, with missing strokes in blue and extra or wrong strokes in red. Stroke order isn't graded, but you get a note if it differs a lot. All thresholds live in `FREE_DRAW_CONFIG` in `src/lib/freeDraw.ts`, with the tuning results next to it.
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
npm test          # unit tests (Vitest)
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

## Credits & licenses

- **Character breakdowns:** [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) `dictionary.txt` by Shaunak Kishore, derived from Unihan and CJKlib. Licensed under **LGPL-3.0-or-later**. The app ships a *modified* (compacted) version, `src/data/hanzi-dict.json`, generated by `scripts/build-hanzi-dict.mjs` (`npm run build:dict`). See [src/data/README.md](src/data/README.md) and `public/licenses/`.
- **Stroke order / writing:** [Hanzi Writer](https://hanziwriter.org) (MIT). Stroke data: hanzi-writer-data (Arphic Public License), derived from Make Me a Hanzi's graphics.
- **Pinyin:** [pinyin-pro](https://github.com/zh-lx/pinyin-pro) (MIT).
- Built with React, Vite, idb and vite-plugin-pwa (MIT/ISC).

The same credits appear in the app under **Stats & data → About & credits**.
