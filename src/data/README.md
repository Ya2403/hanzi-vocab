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
