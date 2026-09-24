#!/usr/bin/env node
/**
 * Builds src/data/tatoeba-cmn.json from manythings.org's Mandarin–English pairs
 * (cmn-eng.zip, derived from Tatoeba, CC-BY 2.0 FR).
 *
 *   1. Download https://www.manythings.org/anki/cmn-eng.zip in a browser
 *      (the site blocks scripted downloads).
 *   2. npm run build:sentences -- path/to/cmn-eng.zip   (or the extracted cmn.txt)
 *
 * Each input line: English \t Chinese \t "CC-BY 2.0 (France) Attribution: tatoeba.org #<en id> (user) & #<zh id> (user)"
 *
 * Output: { _meta, s: [[segmented, english, zhId], …] } where `segmented` is the
 * simplified-Chinese sentence split into words with "|" (Intl.Segmenter 'zh'); joining the
 * segments gives the sentence back. Traditional sentences are converted to simplified
 * (opencc-js) and duplicates dropped (first translation kept).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync, gzipSync } from 'node:zlib';
import * as OpenCC from 'opencc-js';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/tatoeba-cmn.json');
/** Longer sentences are rarely useful as examples and cost the most space. */
const MAX_CHARS = 40;
const SEP = '|';

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run build:sentences -- path/to/cmn-eng.zip (or cmn.txt)');
  process.exit(1);
}

/** Minimal zip reader: find `name` via the central directory and inflate it. */
function unzipEntry(buf, name) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Unsupported zip compression method ${method}.`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} not found in zip.`);
}

const raw = await readFile(input);
const text = (input.toLowerCase().endsWith('.zip') ? unzipEntry(raw, 'cmn.txt') : raw).toString('utf8');

const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const CJK = /[㐀-鿿]/;

const seen = new Set();
const out = [];
let lines = 0;
let converted = 0;
let duplicates = 0;
let tooLong = 0;
let skipped = 0;

for (const line of text.split(/\r?\n/)) {
  if (!line.trim()) continue;
  lines++;
  const [en, zhRaw, attribution = ''] = line.split('\t');
  if (!en || !zhRaw || !CJK.test(zhRaw) || zhRaw.includes(SEP)) {
    skipped++;
    continue;
  }
  const zh = toSimplified(zhRaw.trim());
  if (zh !== zhRaw.trim()) converted++;
  if ([...zh].length > MAX_CHARS) {
    tooLong++;
    continue;
  }
  if (seen.has(zh)) {
    duplicates++;
    continue;
  }
  seen.add(zh);
  const ids = [...attribution.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  // The Chinese sentence's Tatoeba page credits it and lists its translations with their authors,
  // so its id is all the app needs for attribution.
  const zhId = ids[1] ?? 0;
  const segmented = [...segmenter.segment(zh)].map((s) => s.segment).join(SEP);
  out.push([segmented, en.trim(), zhId]);
}

const data = {
  _meta: {
    source: 'Tatoeba (tatoeba.org) via manythings.org/anki cmn-eng.zip',
    license: 'CC BY 2.0 FR',
    attribution: 'Sentences and translations by Tatoeba contributors; see https://tatoeba.org/sentences/show/<id>',
    modified: `Converted to simplified Chinese (opencc-js), deduplicated, sentences over ${MAX_CHARS} characters dropped, segmented with Intl.Segmenter("zh").`,
    format: '[segmented ("|"-separated words), english, tatoebaChineseId]',
  },
  s: out,
};

const json = JSON.stringify(data);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, json);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  `${lines} pairs read → ${out.length} sentences kept ` +
    `(${converted} converted to simplified, ${duplicates} duplicates, ${tooLong} too long, ${skipped} unusable).\n` +
    `Wrote ${OUT}: ${kb(Buffer.byteLength(json))} raw, ${kb(gzipSync(json).length)} gzipped.`,
);
