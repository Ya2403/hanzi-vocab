/**
 * Cloud sync through Firebase (Google sign-in + Firestore). The app itself stays on GitHub
 * Pages; Firebase only stores a copy of the words and progress so devices can share them.
 *
 * Data: users/{uid}/words/{wordId} (a Word, or a tombstone) and users/{uid}/meta/state.
 * Each device keeps its own IndexedDB copy and works offline; Firestore queues writes offline
 * and delivers other devices' changes when online. Firebase code is only loaded once sync is on.
 */
import { useSyncExternalStore } from 'react';
import type { Auth, User } from 'firebase/auth';
import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { dedupeByHanzi, mergeMeta, planInitialPush, planRemoteApply, sameMeta, type RemoteDoc, type SyncMeta } from './syncMerge';
import type { Word } from './types';

// Public web config (not a secret: access is enforced by Firestore rules + Google sign-in).
const firebaseConfig = {
  apiKey: 'AIzaSyCBbaixI76xGjiv9VzHLS0jDtpjl2h8Uxk',
  authDomain: 'hanzi-vocab.firebaseapp.com',
  projectId: 'hanzi-vocab',
  storageBucket: 'hanzi-vocab.firebasestorage.app',
  messagingSenderId: '1014644514692',
  appId: '1:1014644514692:web:1152e66561aa7837d547d1',
};

const ENABLED_KEY = 'hanzi-vocab:sync';
const cursorKey = (uid: string) => `hanzi-vocab:syncCursor:${uid}`;
const BATCH = 400; // Firestore allows 500 writes per batch

/** What the app provides to sync: read local data and apply remote changes (without re-pushing). */
export interface SyncHost {
  getWords(): Word[];
  applyRemote(upserts: Word[], deleteIds: string[]): Promise<void>;
  getMeta(): SyncMeta;
  applyMeta(meta: SyncMeta): Promise<void>;
}

// ---------- Status (for the UI) ----------

export type SyncState = 'off' | 'connecting' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  email?: string;
  name?: string;
  lastSync?: number;
  error?: string;
}

let status: SyncStatus = { state: readEnabled() ? 'connecting' : 'off' };
const listeners = new Set<() => void>();
const setStatus = (patch: Partial<SyncStatus>, replace = false) => {
  status = replace ? (patch as SyncStatus) : { ...status, ...patch };
  listeners.forEach((l) => l());
};
export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}
function writeEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, '1');
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- Firebase (lazy) ----------

type AuthMod = typeof import('firebase/auth');
type FsMod = typeof import('firebase/firestore');

interface Firebase {
  auth: Auth;
  db: Firestore;
  a: AuthMod;
  f: FsMod;
}

let fb: Firebase | null = null;
let loading: Promise<Firebase> | null = null;

function loadFirebase() {
  loading ??= (async () => {
    const [{ initializeApp }, a, f] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const app = initializeApp(firebaseConfig);
    const auth = a.getAuth(app);
    const db = f.initializeFirestore(app, {
      // Offline queue + cache in IndexedDB, shared between tabs.
      localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
    fb = { auth, db, a, f };
    return fb;
  })();
  return loading;
}

// ---------- Session ----------

let host: SyncHost | null = null;
let user: User | null = null;
let unsubs: Unsubscribe[] = [];
let authUnsub: Unsubscribe | null = null;
/** Remote snapshots are applied one after another. */
let chain: Promise<unknown> = Promise.resolve();

/** Called once by the store after local data has loaded. */
export async function initSync(h: SyncHost) {
  host = h;
  if (readEnabled()) await connect();
}

async function connect() {
  setStatus({ state: 'connecting', error: undefined });
  try {
    const { auth, a } = await loadFirebase();
    authUnsub ??= a.onAuthStateChanged(auth, (u) => {
      stopListening();
      user = u;
      if (u) listen(u);
      else setStatus({ state: 'signed-out', email: undefined, name: undefined });
    });
  } catch (e) {
    fail(e);
  }
}

export async function signIn() {
  writeEnabled(true);
  await connect();
  if (!fb) return;
  try {
    const provider = new fb.a.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await fb.a.signInWithPopup(fb.auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      setStatus({ state: 'signed-out' });
      return;
    }
    fail(e, code === 'auth/popup-blocked' ? 'The sign-in window was blocked. Allow pop-ups for this site and try again.' : undefined);
  }
}

export async function signOutSync() {
  stopListening();
  writeEnabled(false);
  if (fb) await fb.a.signOut(fb.auth).catch(() => {});
  setStatus({ state: 'off' }, true);
}

function fail(e: unknown, message?: string) {
  console.error('Sync error', e);
  setStatus({ state: 'error', error: message ?? (e instanceof Error ? e.message : String(e)) });
}

function stopListening() {
  unsubs.forEach((u) => u());
  unsubs = [];
}

function readCursor(uid: string): number {
  try {
    return Number(localStorage.getItem(cursorKey(uid)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function listen(u: User) {
  if (!fb || !host) return;
  const { db, f } = fb;
  const h = host;
  setStatus({ state: 'syncing', email: u.email ?? undefined, name: u.displayName ?? undefined, error: undefined });

  // Only changes since the last sync (server time, so device clocks don't matter).
  const cursor = readCursor(u.uid);
  const col = f.collection(db, 'users', u.uid, 'words');
  const q = cursor ? f.query(col, f.where('syncedAt', '>', f.Timestamp.fromMillis(cursor))) : col;
  // First sync from this device: upload local words once the server (not the offline cache) has answered.
  let initialPushDone = cursor !== 0;

  unsubs.push(
    f.onSnapshot(
      q,
      (snap) => {
        const remote: RemoteDoc[] = [];
        let maxSynced = readCursor(u.uid);
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) continue; // our own unconfirmed writes
          const data = ch.doc.data() as Record<string, unknown> & { syncedAt?: { toMillis(): number } };
          const { syncedAt, ...rest } = data;
          if (syncedAt) maxSynced = Math.max(maxSynced, syncedAt.toMillis());
          remote.push(rest as unknown as RemoteDoc);
        }
        const fromCache = snap.metadata.fromCache;
        const doInitialPush = !initialPushDone && !fromCache;
        if (doInitialPush) initialPushDone = true;
        // Everything the server has (not just this snapshot's changes), for the initial comparison.
        const allRemote = doInitialPush
          ? snap.docs.map((d) => {
              const { syncedAt: _ignored, ...rest } = d.data() as Record<string, unknown>;
              return rest as unknown as RemoteDoc;
            })
          : [];
        chain = chain
          .then(async () => {
            const local = new Map(h.getWords().map((w) => [w.id, w]));
            const { upserts, deletes } = planRemoteApply(local, remote);
            if (upserts.length || deletes.length) await h.applyRemote(upserts, deletes);
            // First sync from this device: upload what the cloud doesn't have yet.
            if (doInitialPush) {
              const remoteMap = new Map(allRemote.map((r) => [r.id, r]));
              await pushWords(planInitialPush(h.getWords(), remoteMap));
            }
            // Same word added separately on two devices: keep one.
            const { drop } = dedupeByHanzi(h.getWords());
            if (drop.length) {
              const ids = drop.map((w) => w.id);
              await h.applyRemote([], ids);
              await pushDeletes(ids);
            }
            if (!fromCache) {
              try {
                localStorage.setItem(cursorKey(u.uid), String(maxSynced));
              } catch {
                /* ignore */
              }
            }
            setStatus(fromCache ? { state: 'offline' } : { state: 'synced', lastSync: Date.now() });
          })
          .catch(fail);
      },
      (e) => fail(e),
    ),
  );

  // Streak and daily counter.
  const metaRef = f.doc(db, 'users', u.uid, 'meta', 'state');
  unsubs.push(
    f.onSnapshot(
      metaRef,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        chain = chain
          .then(async () => {
            const local = h.getMeta();
            if (!snap.exists()) return pushMeta(local);
            const remote = snap.data() as SyncMeta;
            const merged = mergeMeta(local, remote);
            if (!sameMeta(merged, local)) await h.applyMeta(merged);
            if (!sameMeta(merged, remote)) await pushMeta(merged);
          })
          .catch(fail);
      },
      (e) => fail(e),
    ),
  );
}

// ---------- Pushing local changes ----------

async function writeBatches(docs: { id: string; data: Record<string, unknown> }[]) {
  if (!fb || !user || !docs.length) return;
  const { db, f } = fb;
  const uid = user.uid;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = f.writeBatch(db);
    for (const d of docs.slice(i, i + BATCH)) {
      batch.set(f.doc(db, 'users', uid, 'words', d.id), { ...d.data, syncedAt: f.serverTimestamp() });
    }
    // Don't await the server: offline, Firestore queues these and sends them later.
    batch.commit().catch(fail);
  }
}

/** Upload new or changed words (no-op when sync is off). */
export function pushWords(words: Word[]): Promise<void> {
  return writeBatches(words.map((w) => ({ id: w.id, data: { ...w } })));
}

/** Upload deletions as tombstones so other devices remove the words too. */
export function pushDeletes(ids: string[]): Promise<void> {
  const now = Date.now();
  return writeBatches(ids.map((id) => ({ id, data: { id, deleted: true, updatedAt: now } })));
}

export async function pushMeta(meta: SyncMeta): Promise<void> {
  if (!fb || !user) return;
  const { db, f } = fb;
  f.setDoc(f.doc(db, 'users', user.uid, 'meta', 'state'), meta).catch(fail);
}

export const syncActive = () => !!user;
