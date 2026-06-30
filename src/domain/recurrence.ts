import {
  addDays,
  addMonths,
  endOfMonth,
  isAfter,
  isBefore,
  setDate,
  startOfMonth,
} from 'date-fns';

import { RecurrenceKind } from './enums';

/// Weekday is 0=Sunday … 6=Saturday (matches `Date.prototype.getDay()`).
/// `nth` of -1 means "last occurrence in month" for MONTHLY_BY_NTH_WEEKDAY.
export interface RecurrenceSpec {
  kind: RecurrenceKind;
  byWeekday?: number[];
  byMonthDay?: number;
  nth?: number;
  weekday?: number;
  /// ISO timestamp upper bound, inclusive. Beyond this, no further occurrences.
  until?: string;
}

const HARD_OCCURRENCE_LIMIT = 366;

export function isRecurringSpec(spec: RecurrenceSpec | null | undefined): boolean {
  return !!spec && spec.kind !== RecurrenceKind.NONE;
}

/// Generate occurrence start datetimes for a recurring task within [rangeFrom, rangeTo],
/// preserving the base task's local hour/minute/second.
export function expandRecurrence(
  baseStartAt: Date,
  spec: RecurrenceSpec,
  rangeFrom: Date,
  rangeTo: Date
): Date[] {
  if (spec.kind === RecurrenceKind.NONE) {
    return baseStartAt >= rangeFrom && baseStartAt <= rangeTo ? [new Date(baseStartAt)] : [];
  }

  const upperBound = spec.until && new Date(spec.until) < rangeTo ? new Date(spec.until) : rangeTo;
  if (upperBound < baseStartAt || upperBound < rangeFrom) {
    return [];
  }

  switch (spec.kind) {
    case RecurrenceKind.WEEKLY:
      return expandWeekly(baseStartAt, spec, rangeFrom, upperBound);
    case RecurrenceKind.MONTHLY_BY_DATE:
      return expandMonthlyByDate(baseStartAt, spec, rangeFrom, upperBound);
    case RecurrenceKind.MONTHLY_BY_NTH_WEEKDAY:
      return expandMonthlyByNthWeekday(baseStartAt, spec, rangeFrom, upperBound);
    default:
      return [];
  }
}

function expandWeekly(base: Date, spec: RecurrenceSpec, from: Date, to: Date): Date[] {
  const weekdays = spec.byWeekday;
  if (!weekdays?.length) {
    throw new Error('recurrence.WEEKLY requires non-empty byWeekday');
  }
  const valid = new Set(weekdays);
  const out: Date[] = [];
  let cursor = base > from ? new Date(base) : new Date(from);
  cursor = atSameClock(cursor, base);

  while (!isAfter(cursor, to) && out.length < HARD_OCCURRENCE_LIMIT) {
    if (valid.has(cursor.getDay()) && !isBefore(cursor, base)) {
      out.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

function expandMonthlyByDate(base: Date, spec: RecurrenceSpec, from: Date, to: Date): Date[] {
  const day = spec.byMonthDay;
  if (!day || day < 1 || day > 31) {
    throw new Error('recurrence.MONTHLY_BY_DATE requires byMonthDay in 1..31');
  }
  const out: Date[] = [];
  let monthCursor = startOfMonth(base);

  while (monthCursor <= to && out.length < HARD_OCCURRENCE_LIMIT) {
    const lastDay = endOfMonth(monthCursor).getDate();
    if (day <= lastDay) {
      const occ = atSameClock(setDate(monthCursor, day), base);
      if (occ >= base && occ >= from && occ <= to) {
        out.push(occ);
      }
    }
    monthCursor = addMonths(monthCursor, 1);
  }
  return out;
}

function expandMonthlyByNthWeekday(
  base: Date,
  spec: RecurrenceSpec,
  from: Date,
  to: Date
): Date[] {
  const { nth, weekday } = spec;
  if (nth == null || nth < -1 || nth === 0 || nth > 5) {
    throw new Error('recurrence.MONTHLY_BY_NTH_WEEKDAY requires nth in 1..5 or -1');
  }
  if (weekday == null || weekday < 0 || weekday > 6) {
    throw new Error('recurrence.MONTHLY_BY_NTH_WEEKDAY requires weekday in 0..6');
  }
  const out: Date[] = [];
  let monthCursor = startOfMonth(base);

  while (monthCursor <= to && out.length < HARD_OCCURRENCE_LIMIT) {
    const occDate = nthWeekdayOfMonth(monthCursor, nth, weekday);
    if (occDate) {
      const occ = atSameClock(occDate, base);
      if (occ >= base && occ >= from && occ <= to) {
        out.push(occ);
      }
    }
    monthCursor = addMonths(monthCursor, 1);
  }
  return out;
}

function nthWeekdayOfMonth(monthAnchor: Date, nth: number, weekday: number): Date | null {
  const start = startOfMonth(monthAnchor);
  const end = endOfMonth(monthAnchor);

  if (nth === -1) {
    let cursor = end;
    while (cursor.getDay() !== weekday) cursor = addDays(cursor, -1);
    return cursor;
  }

  let cursor = start;
  while (cursor.getDay() !== weekday) cursor = addDays(cursor, 1);
  const target = addDays(cursor, (nth - 1) * 7);
  return target.getMonth() === start.getMonth() ? target : null;
}

function atSameClock(date: Date, sample: Date): Date {
  const out = new Date(date);
  out.setHours(
    sample.getHours(),
    sample.getMinutes(),
    sample.getSeconds(),
    sample.getMilliseconds()
  );
  return out;
}
