#!/usr/bin/env node
/**
 * Converts Make Me a Hanzi's dictionary.txt into the compact JSON the app loads
 * for character breakdowns (src/data/hanzi-dict.json).
 *
 *   npm run build:dict                    # download the pinned version
 *   npm run build:dict -- path/to/dictionary.txt
 *
 * dictionary.txt is © Shaunak Kishore et al., LGPL-3.0-or-later, derived from
 * Unihan and CJKlib. The output is a modified version under the same license;
 * see src/data/README.md.
 *
 * Output shape: { _meta, [char]: [definition, pinyin[], decomposition, radical, etymology?] }
 * where etymology is ["i"|"p", hint] (ideographic / pictographic)
 *                  or ["s", hint, semantic, phonetic] (pictophonetic; any may be null).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '618dbab8a8ddefb958763c8b4afbaa741a4460de';
const SOURCE_URL = `https://raw.githubusercontent.com/skishore/makemeahanzi/${COMMIT}/dictionary.txt`;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/hanzi-dict.json');

const localPath = process.argv[2];
let text;
if (localPath) {
  text = await readFile(localPath, 'utf8');
} else {
  console.log(`Downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  text = await res.text();
}

const TYPE = { ideographic: 'i', pictographic: 'p', pictophonetic: 's' };

const out = {
  _meta: {
    source: `Make Me a Hanzi dictionary.txt (github.com/skishore/makemeahanzi @ ${COMMIT.slice(0, 7)})`,
    derivedFrom: 'Unihan, CJKlib',
    license: 'LGPL-3.0-or-later',
    modified:
      'Converted by scripts/build-hanzi-dict.mjs to compact JSON; kept definition, pinyin, decomposition, radical and etymology; dropped matches.',
  },
};

let count = 0;
for (const line of text.split('\n')) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  const entry = [r.definition ?? '', r.pinyin ?? [], r.decomposition ?? '？', r.radical ?? ''];
  const e = r.etymology;
  if (e && TYPE[e.type]) {
    entry.push(
      e.type === 'pictophonetic'
        ? [TYPE[e.type], e.hint ?? null, e.semantic ?? null, e.phonetic ?? null]
        : [TYPE[e.type], e.hint ?? null],
    );
  }
  out[r.character] = entry;
  count++;
}

const json = JSON.stringify(out);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, json);
console.log(`Wrote ${count} characters, ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB → ${OUT}`);
