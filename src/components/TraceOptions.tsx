import { updateSettings, useSettings } from '../lib/settings';
import { Segmented } from './Segmented';

/** Writing settings: tracing before writing from memory, and the stroke-order animation. */
export function TraceOptions() {
  const { traceMode, strokeOrderFirst } = useSettings();
  return (
    <>
      <Segmented
        label="Trace before writing"
        value={traceMode}
        onChange={(v) => updateSettings({ traceMode: v })}
        options={[
          { value: 'always', label: 'Always' },
          { value: 'weak', label: 'New / weak' },
          { value: 'never', label: 'Never' },
        ]}
      />
      <label className={`toggle ${traceMode === 'never' ? 'disabled' : ''}`}>
        <input
          type="checkbox"
          checked={strokeOrderFirst}
          disabled={traceMode === 'never'}
          onChange={(e) => updateSettings({ strokeOrderFirst: e.target.checked })}
        />
        <span>Play the stroke order before tracing</span>
      </label>
      <p className="hint">
        Each character: {traceMode !== 'never' && strokeOrderFirst ? 'watch the stroke order, ' : ''}
        {traceMode !== 'never' ? 'trace it over a faint outline (not graded), then ' : ''}write it from memory on a blank grid. That
        first blank attempt is graded; if it goes badly, you trace and write it once more. A few cards later it comes back once
        more on a blank grid.
        {traceMode === 'weak' && ' “New / weak”: words whose writing interval is under 6 days.'}
      </p>
    </>
  );
}
