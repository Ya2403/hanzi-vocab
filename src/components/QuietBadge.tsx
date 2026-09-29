import { QUIET_MINUTES, stopQuiet, useQuiet } from '../lib/quiet';
import { Icon } from './Icon';

/** Shown while listening is paused ("Can't listen now"); tap to turn listening back on. */
export function QuietBadge() {
  const quiet = useQuiet();
  if (!quiet) return null;
  return (
    <button
      className="pill quiet-badge"
      onClick={stopQuiet}
      title={`Listening paused (this session, at least ${QUIET_MINUTES} min). Tap to turn it back on.`}
      aria-label="Listening paused. Tap to turn listening back on."
    >
      <Icon name="headphonesOff" size={16} />
    </button>
  );
}
