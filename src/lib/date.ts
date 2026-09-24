/** All scheduling uses local calendar dates formatted as YYYY-MM-DD. */
export function toDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const today = (): string => toDateStr();

function parse(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m, d];
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = parse(dateStr);
  return toDateStr(new Date(y, m - 1, d + n));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = parse(a);
  const [by, bm, bd] = parse(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = parse(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function isValidDateStr(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
