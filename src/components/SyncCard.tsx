import { useEffect, useState } from 'react';
import { signIn, signOutSync, useSyncStatus } from '../lib/sync';

const ago = (t?: number) => {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 10 ? 'just now' : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString();
};

export function SyncCard() {
  const status = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000); // keep "x min ago" fresh
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    setBusy(true);
    await signIn();
    setBusy(false);
  };
  const stop = () => {
    if (confirm('Stop syncing on this device? Your words stay here; they just stop syncing until you sign in again.')) signOutSync();
  };

  const signedIn = status.state === 'syncing' || status.state === 'synced' || status.state === 'offline' || (status.state === 'error' && status.email);

  return (
    <div className="card form sync-card">
      <h2>Sync between devices</h2>
      {signedIn ? (
        <>
          <p className="small">
            Signed in as <b>{status.email ?? status.name}</b>
          </p>
          <p className={`sync-state ${status.state}`}>
            {status.state === 'synced' && <>✓ Synced {ago(status.lastSync)}</>}
            {status.state === 'syncing' && <>Syncing…</>}
            {status.state === 'offline' && <>Offline: changes are saved and will sync when you’re back online.</>}
            {status.state === 'error' && <>Sync problem: {status.error}</>}
          </p>
          <p className="hint">
            Words, progress and your streak sync automatically on every device where you sign in with this account. Settings
            (like pinyin display) stay per device.
          </p>
          <button className="btn block" onClick={stop}>
            Sign out on this device
          </button>
        </>
      ) : (
        <>
          <p className="muted small">
            Sign in with Google on your phone and tablet to keep your words and progress the same on both. Your data is stored
            privately in the app’s Firebase database; the app itself stays on GitHub Pages.
          </p>
          {status.state === 'error' && <p className="hint error">{status.error}</p>}
          <button className="btn primary block" onClick={start} disabled={busy || status.state === 'connecting'}>
            {busy || status.state === 'connecting' ? 'Connecting…' : 'Sign in with Google'}
          </button>
          <p className="hint">
            First time on a device: your words here are merged with the ones already synced. If the same word differs, the
            most recently changed version wins. A backup export beforehand doesn’t hurt.
          </p>
        </>
      )}
    </div>
  );
}
