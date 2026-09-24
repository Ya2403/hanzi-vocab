import { useState } from 'react';
import { useStore } from '../store';
import { Modal } from './Modal';

/** Shown the moment a word becomes a leech: offer to add a memory trick right away. */
export function LeechPrompt({ wordId, lapses, onClose }: { wordId: string; lapses: number; onClose(): void }) {
  const { words, updateWord } = useStore();
  const word = words.find((w) => w.id === wordId);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(word?.notes ?? '');
  const [saving, setSaving] = useState(false);
  if (!word) return null;

  const save = async () => {
    setSaving(true);
    // Re-read the word so the review just saved isn't overwritten.
    const latest = words.find((w) => w.id === wordId) ?? word;
    await updateWord({ ...latest, notes });
    onClose();
  };

  return (
    <Modal title="🐛 Leech" onClose={onClose}>
      <div className="form">
        <p>
          You’ve missed <b lang="zh-CN">{word.hanzi}</b> ({word.meaning}) {lapses} times. Add a memory trick?
        </p>
        {editing ? (
          <>
            <label className="field">
              <span className="field-label">Notes / mnemonic</span>
              <textarea
                className="input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 学: a child 子 studying under a roof"
                autoFocus
              />
            </label>
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={save} disabled={saving}>
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            {word.notes && <p className="small muted">Current note: {word.notes}</p>}
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Not now
              </button>
              <button type="button" className="btn primary" onClick={() => setEditing(true)} autoFocus>
                {word.notes ? 'Edit memory trick' : 'Add a memory trick'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
