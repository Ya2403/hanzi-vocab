# Hanzi Vocab

A Chinese vocabulary trainer: React + Vite + TypeScript, installable as a PWA, with all data stored locally in IndexedDB.

## Features

- **Skills**: every learned word has a separate SM-2 schedule per skill: **meaning** (hanzi → meaning), **pinyin** (hanzi → pinyin, also listening), **recall** (meaning → hanzi) and, with the "Writing practice" setting on, **writing** (draw it from memory; it starts once the word's recall interval reaches 6 days). Each skill keeps its interval, ease, due date, repetitions, lapses, accuracy and last 5 results. A word is *due* when any skill is due, and a review card tests one due skill (most overdue first, never the same word twice in a row when avoidable). A word is as strong as its weakest skill: this drives the word list status, Practice and exercise choice. A skill with 5+ lapses (Settings) becomes a leech, and the 🐛 badge names it. The word detail shows every skill's next review, interval, accuracy and last answers. Radical-only entries (氵…) have meaning and recall only.
- **Upgrading from one schedule**: words from older versions (and old backups) are migrated automatically. The old schedule becomes *meaning*. *Pinyin* and *recall* start at half its interval (at least 1 day), due from tomorrow at the earliest, with overdue ones spread over the next days so reviews don't pile up. Words with review history count as learned.
- **Continue** (Review tab, the home screen): one button plans the day. It runs everything due for review, then new words in Learn up to the daily limit, then shows "Done for today" with a **Practice more** round. The summary line reads "X reviews · Y new words left today". Word states: *new* (not learned yet, only in Learn), *learned* (finished Learn, has an SM-2 schedule) and *due* (learned, and its review date has come). Review and Practice use learned words only, and every count follows the same rule.
- **Automatic exercises** (on by default, toggle in Review and Practice): each card's exercise follows the strength of the skill it tests. Meaning: multiple choice 中 → EN, typing the meaning once strong. Pinyin: multiple choice 中 → 拼音, sometimes listening when medium, typing pinyin once strong. Recall: multiple choice EN → 中, typing hanzi once strong. Writing: a writing card. Missed cards come back as multiple choice. Turn it off to choose modes yourself (Review then still tests each due skill in its own direction).
- **Answer statistics**: every answer in Review, Learn and Practice updates the tested skill's accuracy (correct/total) and its last 5 results (Learn: 中 → EN counts for meaning, listening for pinyin, EN → 中 and typing for recall).
- **Word list**: add, edit and delete words (hanzi, pinyin, meaning, optional example sentence, tags). Pinyin is generated automatically with `pinyin-pro` until you type your own. Search works with or without tone marks (`ni hao` finds 你好), and you can filter by tag.
- **Learn** (tab): new words are taught here before they reach Review. Pick all new words or some categories. Words are taught in batches (default 6) up to a daily limit (default 15). Prerequisites come first: a character before words that use it, and components before the characters built from them (using Make Me a Hanzi data; otherwise words tagged "key" go first). After that, the order you added words is kept, and look-alikes (未/末, 吃/喝, …) are kept out of the same batch when possible. Each word gets a teaching card (hanzi, pinyin, audio, meaning, components such as 妈 = 女 woman + 马 horse, notes, example) and a quick meaning check. The batch then goes through four rounds: 中 → EN, listening, EN → 中, and an optional typing round. Misses come back later in the same round. Learned words are first reviewed tomorrow. Radical-only entries (氵, 扌, 讠) get only the two recognition rounds. The Review tab shows Learn progress per category.
- **Daily review**: SM-2 spaced repetition over the words due today. Words you have not learned yet are not shown in Review. Flashcards grade Again / Hard / Good / Easy (qualities 1/3/4/5), and multiple choice grades Good or Again. Words you miss come back later in the same session, but only your first answer is graded.
- **Typing**: type the answer from the keyboard. For 中 → EN, type the meaning: any one sense counts, and case, "to"/"a"/"the" and small typos are forgiven. For EN → 中, type hanzi or pinyin, with tone marks (`nǐ hǎo`), numbers (`ni3hao3`, `5` = neutral) or `v` for ü. Right syllables with wrong or missing tones count as "close" (Hard). An "I was right" button overrides a wrong verdict.
- **Character breakdown**: tap a word to open its detail view, or expand "Breakdown" on a flashcard back. For each character you see its components with their meanings, the radical, and the etymology, e.g. 好 = 女 + 子, "A woman 女 with a son 子". For meaning + sound characters, the parts are labelled (妈: 女 gives the meaning, 马 mǎ gives the sound). Tap a component to see other words in your list that contain it. The data, from Make Me a Hanzi, loads the first time it's needed and is cached for offline use.
- **Notes & leeches**: every word has an optional "Notes / mnemonic" field, shown in the editor, the detail view and on flashcard backs, and included in export/import. A lapse is an Again on a word that had graduated (interval ≥ 1 day). When a word reaches the leech threshold (Settings, default 5 lapses), a prompt offers to add a memory trick right away. Leeches get a 🐛 badge, a filter chip in the word list and a source option in free Practice. The editor has Reset progress and Unmark leech (after unmarking, a full threshold of new lapses is needed to flag it again).
- **Pinyin visibility**: hide pinyin on practice question sides and under example sentences (Settings switch, or the 拼音 button in a session). Tap the characters or a sentence to reveal it for that card. "Show pinyin after answering" (on by default) still shows it on the answer side. The word list has its own toggle. Writing mode keeps pinyin, since it is part of the prompt.
- **Example sentences (Tatoeba)**: about 27,800 Mandarin–English sentence pairs, converted to simplified Chinese and split into words at build time. A sentence matches a word only when the word is a whole segment (学 does not match inside 学校), with substring matching as a fallback for words the segmenter splits (图书馆). Matches are ranked by how many of the sentence's other words you have learned, then by length, and labelled "all known" or "N new words". Use **Find sentences** in the word editor, or the bulk action on Stats & data. The data (≈0.9 MB gzipped) loads the first time it is needed and is cached for offline use.
- **Sentence mode**: a cloze. You see a sentence with the word blanked out, plus its translation and the word's meaning, and type the missing word in hanzi or pinyin. "Sentence source" is either your own sentences only, or yours plus Tatoeba. With Tatoeba, the best-ranked sentences rotate so you do not memorize just one.
- **Filter**: Review and Practice default to all learned words. The Filter button opens category chips grouped into Lessons (tags starting with "lesson" or "HSK lesson") and Topics (other tags, plus 🐛 Leeches), e.g. "HSK lesson 1 · 12 learned · 3 due". Selecting several uses every learned word in any of them. Selecting a tag in the word list shows a "Practice this tag" shortcut.
- **Directions**: 中 → EN, EN → 中, 中 → 拼音 (character to pinyin), or Mixed. In 中 → 拼音, multiple choice offers tone-confusable answers (hǎo / hào / háo), and typing expects pinyin.
- **Match pairs**: a Choice style with up to 5 words at a time in two shuffled columns. Tap a word, then its match. Words matched wrongly first time are graded Again and come back later in the session.
- **Layout**: practice sessions are full screen (the app header is hidden). In landscape on tablets, a session fits the screen without scrolling: the question on the left and the answers on the right, and writing gets a drawing grid of up to 480 px. Wide screens use two columns for the word list, the setup options and Stats & data.
- **Writing**: draw each character stroke by stroke with [Hanzi Writer](https://hanziwriter.org), which checks every stroke. After 3 misses on a stroke you get a hint. "Show strokes" animates the stroke order, and tracing mode shows a faint outline to draw over. The grade is automatic: no mistakes = Good, some mistakes or the demo = Hard, Reveal = Again. Stroke data comes from the jsDelivr CDN, one character at a time, and is kept in Cache Storage. Stats & data has a button to download it for your whole list, for offline use.
- **Free draw** (second writing style; switch in the session options or with the toggle on the card): draw the whole character in any order, then tap **Check**. Undo stroke and Clear are available. Your strokes are paired with the reference stroke medians regardless of order (Hungarian matching on shape, position, direction and length, after aligning your drawing to the reference). You get a percentage and **Correct / Close / Wrong**, and your drawing is shown over the correct character, with missing strokes in blue and extra or wrong strokes in red. Stroke order isn't graded, but you get a note if it differs a lot. All thresholds live in `FREE_DRAW_CONFIG` in `src/lib/freeDraw.ts`, with the tuning results next to it.
- **Smart practice**: the Practice tab (and Practice more) picks learned words by weakness: recent misses, low accuracy, low ease, due soonest and least recently seen. Sessions have 20 cards by default (10 / 20 / 50). Correct answers don't change the schedule. A miss brings the word's next review forward to tomorrow at the latest, and for a well-known word (interval 7+ days) it counts as a lapse toward the leech threshold.
- **Audio**: Web Speech API with a `zh-CN` voice. It can play automatically when an answer is revealed, and the speech rate is adjustable.
- **Streak**: any answered card counts for the day.
- **Bulk add**: copy the built-in prompt and give it to ChatGPT (or any AI chat) with a PDF, photo or list, then paste the reply back. The expected format is one word per line, `hanzi | pinyin | meaning | example | tags`. The parser also accepts markdown tables, tab-separated rows, numbered pinyin (`ni3 hao3`) and JSON. A preview shows new words, duplicates and unreadable lines before anything is saved.
- **Sync between devices** (Stats → Sync): sign in with Google and your words, progress, deletions and streak sync automatically through Firebase (Firestore), so all your devices stay the same. The app is still hosted on GitHub Pages; Firebase only stores the data, under `users/{uid}/…`, and the security rules let each signed-in user access only their own data. Each device keeps working offline and catches up when online. When the same word was changed on two devices, the newer change wins, and the same word added separately on two devices is merged into one. Settings stay per device. The Firebase code is only loaded once sync is turned on.
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
- **Example sentences:** [Tatoeba](https://tatoeba.org) contributors, [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/), via [manythings.org](https://www.manythings.org/anki/). Modified (converted to simplified Chinese, deduplicated, segmented) by `scripts/build-sentences.mjs`. Each sentence the app shows links to its Tatoeba page. See [src/data/README.md](src/data/README.md).
- **Pinyin:** [pinyin-pro](https://github.com/zh-lx/pinyin-pro) (MIT).
- Built with React, Vite, idb and vite-plugin-pwa (MIT/ISC).

The same credits appear in the app under **Stats & data → About & credits**.
