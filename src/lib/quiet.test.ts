import { afterEach, describe, expect, it, vi } from 'vitest';
import { endQuietSession, isQuiet, startQuiet, stopQuiet } from './quiet';

describe("Can't listen now", () => {
  afterEach(() => {
    stopQuiet();
    vi.useRealTimers();
  });

  it('lasts at least 15 minutes after the session ends', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T10:00:00'));
    startQuiet();
    endQuietSession();
    expect(isQuiet()).toBe(true);
    vi.setSystemTime(new Date('2026-09-29T10:14:00'));
    expect(isQuiet()).toBe(true);
    vi.setSystemTime(new Date('2026-09-29T10:16:00'));
    expect(isQuiet()).toBe(false);
  });

  it('lasts the whole session when that is longer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T10:00:00'));
    startQuiet();
    vi.setSystemTime(new Date('2026-09-29T10:40:00'));
    expect(isQuiet()).toBe(true);
    endQuietSession();
    expect(isQuiet()).toBe(false);
  });

  it('can be turned back on right away', () => {
    startQuiet();
    stopQuiet();
    expect(isQuiet()).toBe(false);
  });
});
