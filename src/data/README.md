# Character data

## hanzi-dict.json

Character definitions, pinyin, decompositions, radicals and etymologies used by the **Breakdown** feature.

- **Source:** `dictionary.txt` from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) by Shaunak Kishore, at commit `618dbab8a8ddefb958763c8b4afbaa741a4460de`. That file is itself derived from [Unihan](https://unicode.org/charts/unihan.html) and [CJKlib](https://github.com/cburgmer/cjklib).
- **License:** GNU Lesser General Public License, version 3 or (at your option) any later version. See `public/licenses/LGPL-3.0.txt`, `public/licenses/GPL-3.0.txt`, and the upstream notice in `public/licenses/makemeahanzi-COPYING.txt`.
- **Modifications:** this is a **modified version** of `dictionary.txt`. [`scripts/build-hanzi-dict.mjs`](../../scripts/build-hanzi-dict.mjs) converts it to a single compact JSON object:
  - kept: definition, pinyin, decomposition, radical, etymology (type, hint, semantic, phonetic)
  - dropped: `matches` (stroke-to-component mapping)
  - the etymology type is abbreviated: `i` = ideographic, `p` = pictographic, `s` = pictophonetic (semantic + phonetic)

  The content of the kept fields is unchanged.

To regenerate (or build from your own modified `dictionary.txt`):

```bash
npm run build:dict
npm run build:dict -- path/to/dictionary.txt
```

This data file is covered by the LGPL, as above. The rest of the app's code isn't.

## tatoeba-cmn.json

Mandarin example sentences with English translations, used by **Find sentences**, the bulk "Add Tatoeba sentences" action and Sentence mode.

- **Source:** the Mandarin–English pairs `cmn-eng.zip` from [manythings.org/anki](https://www.manythings.org/anki/), which are taken from [Tatoeba](https://tatoeba.org).
- **License:** [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). Attribution: the sentences and translations are by Tatoeba's contributors. Each entry keeps its Tatoeba sentence IDs, and the app links every sentence it shows to `https://tatoeba.org/sentences/show/<id>`, which lists the authors.
- **Modifications:** [`scripts/build-sentences.mjs`](../../scripts/build-sentences.mjs) converts traditional characters to simplified ([opencc-js](https://github.com/nk2028/opencc-js)), drops duplicate sentences (keeping the first translation) and sentences over 40 characters, and splits each sentence into words with `Intl.Segmenter('zh', { granularity: 'word' })`.
- **Format:** `{ _meta, s: [[segmented, english, tatoebaChineseId], …] }`, where `segmented` is the sentence with words separated by `|`.

To regenerate, first download `cmn-eng.zip` in a browser (the site blocks scripted downloads), then run:

```bash
npm run build:sentences -- path/to/cmn-eng.zip
```
