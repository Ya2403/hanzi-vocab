import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useStore, type ImportMode } from '../store';
import { today } from '../lib/date';
import { exportWords, parseImport } from '../lib/io';
import { isDue, isNew } from '../lib/srs';
import { liveStreak } from '../lib/streak';
import { updateSettings, useSettings } from '../lib/settings';
import { hasChineseVoice, onVoicesChanged, speak, speechSupported } from '../lib/speech';
import { prefetchStrokes, writableChars } from '../lib/strokes';
import { hanziDictCached, loadHanziDict } from '../lib/hanziDict';
import { Segmented } from '../components/Segmented';
import { BulkAdd } from '../components/BulkAdd';

export function DataScreen() {
  const { words, streak, importWords } = useStore();
  const settings = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [voiceOk, setVoiceOk] = useState(hasChineseVoice);
  const [bulk, setBulk] = useState(false);

  useEffect(() => onVoicesChanged(() => setVoiceOk(hasChineseVoice())), []);

  const learned = words.filter((w) => !isNew(w)).length;
  const mature = words.filter((w) => w.srs.interval >= 21).length;
  const due = words.filter((w) => isDue(w)).length;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { words: incoming, invalid } = parseImport(await file.text());
      if (!incoming.length) throw new Error('The file contains no valid words.');
      if (
        importMode === 'replace' &&
        !confirm(`Replace all ${words.length} existing words with ${incoming.length} words from “${file.name}”? This cannot be undone.`)
      )
        return;
      const { added, skipped } = await importWords(incoming, importMode);
      const parts = [`Imported ${added} word${added === 1 ? '' : 's'}`];
      if (skipped) parts.push(`skipped ${skipped} already in your list`);
      if (invalid) parts.push(`ignored ${invalid} invalid entr${invalid === 1 ? 'y' : 'ies'}`);
      setMessage({ kind: 'ok', text: parts.join(', ') + '.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Import failed.' });
    }
  };

  return (
    <section className="screen">
      <div className="card">
        <h2>Progress</h2>
        <div className="stat-grid">
          <Stat value={words.length} label="words" />
          <Stat value={learned} label="studied" />
          <Stat value={mature} label="mature (21d+)" />
          <Stat value={due} label="due now" />
          <Stat value={liveStreak(streak, today())} label="current streak" />
          <Stat value={streak.longest} label="longest streak" />
        </div>
      </div>

      <div className="card form">
        <h2>Backup</h2>
        <p className="muted small">Your words live only in this browser. Export regularly to keep a backup or move to another device.</p>
        <button className="btn block" onClick={() => exportWords(words)} disabled={!words.length}>
          Export {words.length} words as JSON
        </button>
        <Segmented
          label="Import mode"
          value={importMode}
          onChange={setImportMode}
          options={[
            { value: 'merge', label: 'Merge' },
            { value: 'replace', label: 'Replace all' },
          ]}
        />
        <p className="hint">
          {importMode === 'merge'
            ? 'Adds new words; words already in your list (same hanzi) are skipped.'
            : 'Deletes your current list and replaces it with the file’s words.'}
        </p>
        <button className="btn block" onClick={() => fileRef.current?.click()}>
          Import from JSON…
        </button>
        <button className="btn block" onClick={() => setBulk(true)}>
          Bulk add from text / AI output…
        </button>
        {bulk && <BulkAdd onClose={() => setBulk(false)} />}
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        {message && <p className={`hint ${message.kind === 'error' ? 'error' : 'ok'}`}>{message.text}</p>}
      </div>

      <OfflineData chars={words.flatMap((w) => writableChars(w.hanzi))} />

      <div className="card form">
        <h2>Audio</h2>
        {!speechSupported ? (
          <p className="hint warn">This browser doesn’t support speech synthesis.</p>
        ) : (
          <>
            {!voiceOk && (
              <p className="hint warn">No Chinese voice found. Install a Chinese (zh-CN) voice in your OS speech settings for best results.</p>
            )}
            <label className="toggle">
              <input type="checkbox" checked={settings.autoPlay} onChange={(e) => updateSettings({ autoPlay: e.target.checked })} />
              <span>Play audio automatically when answers are revealed</span>
            </label>
            <label className="field">
              <span className="field-label">Speech rate · {settings.speechRate.toFixed(1)}×</span>
              <input
                type="range"
                min={0.5}
                max={1.3}
                step={0.1}
                value={settings.speechRate}
                onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })}
              />
            </label>
            <button className="btn block" onClick={() => speak('你好，欢迎学习中文。')}>
              Test voice
            </button>
          </>
        )}
      </div>

      <About />
    </section>
  );
}

/** Stroke data (per character) and the character dictionary load on demand; this fetches them up front. */
function OfflineData({ chars }: { chars: string[] }) {
  const unique = [...new Set(chars)];
  const [dictReady, setDictReady] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    hanziDictCached().then(setDictReady, () => setDictReady(false));
  }, []);

  const download = async () => {
    setResult(null);
    const problems: string[] = [];
    setProgress('Downloading character breakdowns…');
    try {
      await loadHanziDict();
      setDictReady(true);
    } catch {
      problems.push('character breakdowns');
    }
    if (unique.length) {
      const { failed } = await prefetchStrokes(unique, (done, total) => setProgress(`Downloading strokes… ${done}/${total}`));
      if (failed.length) problems.push(`strokes for ${failed.slice(0, 12).join(' ')}${failed.length > 12 ? ' …' : ''}`);
    }
    setProgress(null);
    setResult(
      problems.length
        ? { ok: false, text: `Couldn’t download ${problems.join(' and ')}. Check your connection and try again.` }
        : { ok: true, text: `Saved: character breakdowns and strokes for ${unique.length} characters.` },
    );
  };

  return (
    <div className="card form">
      <h2>Offline data</h2>
      <p className="muted small">
        Character breakdowns (about 280 KB) and writing-practice strokes download the first time you use them, then stay on
        this device. To use them offline (e.g. on your phone), download everything for your list now.
      </p>
      <p className="small">
        Character breakdowns:{' '}
        {dictReady === null ? '…' : dictReady ? <span className="ok-text">saved ✓</span> : <span className="muted">not downloaded</span>}
      </p>
      <button className="btn block" onClick={download} disabled={progress !== null}>
        {progress ?? `Download offline data (${unique.length} characters)`}
      </button>
      {result && <p className={`hint ${result.ok ? 'ok' : 'error'}`}>{result.text}</p>}
    </div>
  );
}

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/Ya2403/hanzi-vocab';

function About() {
  return (
    <div className="card about">
      <h2>About &amp; credits</h2>
      <p className="small">
        Hanzi Vocab v{__APP_VERSION__} · <a href={REPO} target="_blank" rel="noreferrer">source code</a>
      </p>
      <ul className="credits small">
        <li>
          <b>Character breakdowns</b> come from{' '}
          <a href="https://github.com/skishore/makemeahanzi" target="_blank" rel="noreferrer">Make Me a Hanzi</a> by Shaunak
          Kishore (<code>dictionary.txt</code>, derived from Unihan and CJKlib). It’s licensed under the{' '}
          <a href={`${BASE}licenses/LGPL-3.0.txt`} target="_blank" rel="noreferrer">GNU LGPL v3</a> or later (which builds on
          the <a href={`${BASE}licenses/GPL-3.0.txt`} target="_blank" rel="noreferrer">GNU GPL v3</a>). See the{' '}
          <a href={`${BASE}licenses/makemeahanzi-COPYING.txt`} target="_blank" rel="noreferrer">upstream notice</a>. This app
          uses a <b>modified version</b>, converted to compact JSON by{' '}
          <a href={`${REPO}/blob/main/scripts/build-hanzi-dict.mjs`} target="_blank" rel="noreferrer">this script</a>.
        </li>
        <li>
          <b>Stroke order &amp; writing</b>: <a href="https://hanziwriter.org" target="_blank" rel="noreferrer">Hanzi Writer</a>{' '}
          by David Chanin (MIT). Stroke data: hanzi-writer-data (Arphic Public License), derived from Make Me a Hanzi’s graphics,
          which come from Arphic Technology fonts.
        </li>
        <li>
          <b>Pinyin</b>: <a href="https://github.com/zh-lx/pinyin-pro" target="_blank" rel="noreferrer">pinyin-pro</a> (MIT).
        </li>
        <li>Built with React, Vite, idb and vite-plugin-pwa (MIT/ISC licenses).</li>
      </ul>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
