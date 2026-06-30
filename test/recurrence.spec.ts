import { describe, expect, it } from 'vitest';

import { RecurrenceKind } from '../src/domain/enums';
import { expandRecurrence, isRecurringSpec, RecurrenceSpec } from '../src/domain/recurrence';

const at = (iso: string) => new Date(iso);

describe('isRecurringSpec', () => {
  it('treats NONE / null / undefined as non-recurring', () => {
    expect(isRecurringSpec(undefined)).toBe(false);
    expect(isRecurringSpec(null)).toBe(false);
    expect(isRecurringSpec({ kind: RecurrenceKind.NONE })).toBe(false);
    expect(isRecurringSpec({ kind: RecurrenceKind.WEEKLY, byWeekday: [1] })).toBe(true);
  });
});

describe('expandRecurrence — WEEKLY', () => {
  it('emits each matching weekday, preserving the base clock time', () => {
    // 2026-01-05 is a Monday, 09:30 local.
    const base = at('2026-01-05T09:30:00');
    const spec: RecurrenceSpec = { kind: RecurrenceKind.WEEKLY, byWeekday: [1, 3] }; // Mon, Wed
    const occ = expandRecurrence(base, spec, at('2026-01-05T00:00:00'), at('2026-01-15T23:59:59'));

    // Mon 5, Wed 7, Mon 12, Wed 14
    expect(occ.map(d => d.getDate())).toEqual([5, 7, 12, 14]);
    for (const d of occ) {
      expect(d.getHours()).toBe(9);
      expect(d.getMinutes()).toBe(30);
    }
  });

  it('never emits before the base start', () => {
    const base = at('2026-01-07T08:00:00'); // Wed
    const spec: RecurrenceSpec = { kind: RecurrenceKind.WEEKLY, byWeekday: [1, 3] };
    const occ = expandRecurrence(base, spec, at('2026-01-01T00:00:00'), at('2026-01-09T23:59:59'));
    expect(occ.every(d => d >= base)).toBe(true);
  });

  it('honours the `until` upper bound', () => {
    const base = at('2026-01-05T09:30:00');
    const spec: RecurrenceSpec = {
      kind: RecurrenceKind.WEEKLY,
      byWeekday: [1],
      until: '2026-01-12T00:00:00.000Z',
    };
    const occ = expandRecurrence(base, spec, base, at('2026-02-01T00:00:00'));
    expect(occ.length).toBeLessThanOrEqual(2);
  });
});

describe('expandRecurrence — MONTHLY_BY_DATE', () => {
  it('emits the given day each month and skips months without that day', () => {
    const base = at('2026-01-31T12:00:00');
    const spec: RecurrenceSpec = { kind: RecurrenceKind.MONTHLY_BY_DATE, byMonthDay: 31 };
    const occ = expandRecurrence(base, spec, base, at('2026-04-30T23:59:59'));
    // Jan 31 and Mar 31 exist; Feb (no 31) and Apr (no 31) are skipped.
    expect(occ.map(d => `${d.getMonth() + 1}-${d.getDate()}`)).toEqual(['1-31', '3-31']);
  });
});

describe('expandRecurrence — MONTHLY_BY_NTH_WEEKDAY', () => {
  it('finds the 2nd Tuesday each month', () => {
    const base = at('2026-01-01T10:00:00');
    const spec: RecurrenceSpec = {
      kind: RecurrenceKind.MONTHLY_BY_NTH_WEEKDAY,
      nth: 2,
      weekday: 2, // Tuesday
    };
    const occ = expandRecurrence(base, spec, base, at('2026-03-31T23:59:59'));
    // 2nd Tue: Jan 13, Feb 10, Mar 10 (2026)
    expect(occ.map(d => `${d.getMonth() + 1}-${d.getDate()}`)).toEqual(['1-13', '2-10', '3-10']);
  });

  it('supports nth = -1 (last weekday of month)', () => {
    const base = at('2026-01-01T10:00:00');
    const spec: RecurrenceSpec = {
      kind: RecurrenceKind.MONTHLY_BY_NTH_WEEKDAY,
      nth: -1,
      weekday: 5, // Friday
    };
    const occ = expandRecurrence(base, spec, base, at('2026-02-28T23:59:59'));
    // Last Friday: Jan 30, Feb 27 (2026)
    expect(occ.map(d => `${d.getMonth() + 1}-${d.getDate()}`)).toEqual(['1-30', '2-27']);
  });
});
