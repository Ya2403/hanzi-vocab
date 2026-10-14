import { PLACEHOLDER } from '../lib/words';

/** Chinese text with "…" placeholders (对…说) shown as a small grey chip. */
export function HanziText({ text }: { text: string }) {
  if (!text.includes(PLACEHOLDER)) return <>{text}</>;
  const parts = text.split(PLACEHOLDER);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && (
            <span className="placeholder-chip" title="someone / something" aria-label="someone or something">
              …
            </span>
          )}
          {p}
        </span>
      ))}
    </>
  );
}
