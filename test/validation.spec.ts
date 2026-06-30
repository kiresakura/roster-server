import { describe, expect, it } from 'vitest';

import { CompletionMode, RecurrenceKind, TaskType } from '../src/domain/enums';
import {
  assertCreateInputValid,
  CreateTaskInputShape,
  DomainValidationError,
  normalizeRecurrence,
} from '../src/domain/validation';

const baseTask: CreateTaskInputShape = {
  type: TaskType.TASK,
  completionMode: CompletionMode.ANY,
  startAt: new Date('2026-01-05T09:00:00Z'),
  assigneeIds: ['u1'],
};

describe('assertCreateInputValid', () => {
  it('accepts a well-formed TASK', () => {
    expect(() => assertCreateInputValid(baseTask)).not.toThrow();
  });

  it('rejects a task with no assignees', () => {
    expect(() => assertCreateInputValid({ ...baseTask, assigneeIds: [] })).toThrow(
      DomainValidationError
    );
  });

  it('requires completionMode for TASK', () => {
    expect(() =>
      assertCreateInputValid({ ...baseTask, completionMode: null })
    ).toThrow(/completionMode/);
  });

  it('forbids completionMode on REMINDER', () => {
    expect(() =>
      assertCreateInputValid({
        ...baseTask,
        type: TaskType.REMINDER,
        completionMode: CompletionMode.ANY,
      })
    ).toThrow(/REMINDER/);
  });

  it('rejects dueAt earlier than startAt', () => {
    expect(() =>
      assertCreateInputValid({
        ...baseTask,
        dueAt: new Date('2026-01-04T09:00:00Z'),
      })
    ).toThrow(/dueAt/);
  });
});

describe('normalizeRecurrence', () => {
  it('dedupes and sorts WEEKLY weekdays', () => {
    const spec = normalizeRecurrence({ kind: RecurrenceKind.WEEKLY, byWeekday: [3, 1, 3] });
    expect(spec.byWeekday).toEqual([1, 3]);
  });

  it('rejects out-of-range weekdays', () => {
    expect(() =>
      normalizeRecurrence({ kind: RecurrenceKind.WEEKLY, byWeekday: [7] })
    ).toThrow(DomainValidationError);
  });

  it('validates MONTHLY_BY_DATE range', () => {
    expect(() =>
      normalizeRecurrence({ kind: RecurrenceKind.MONTHLY_BY_DATE, byMonthDay: 32 })
    ).toThrow(/byMonthDay/);
    expect(normalizeRecurrence({ kind: RecurrenceKind.MONTHLY_BY_DATE, byMonthDay: 15 }).byMonthDay).toBe(15);
  });

  it('validates MONTHLY_BY_NTH_WEEKDAY (nth in 1..5 or -1)', () => {
    expect(() =>
      normalizeRecurrence({ kind: RecurrenceKind.MONTHLY_BY_NTH_WEEKDAY, nth: 0, weekday: 2 })
    ).toThrow();
    const ok = normalizeRecurrence({
      kind: RecurrenceKind.MONTHLY_BY_NTH_WEEKDAY,
      nth: -1,
      weekday: 5,
    });
    expect(ok).toMatchObject({ nth: -1, weekday: 5 });
  });

  it('serializes `until` to an ISO string', () => {
    const until = new Date('2026-03-01T00:00:00Z');
    const spec = normalizeRecurrence({ kind: RecurrenceKind.WEEKLY, byWeekday: [1], until });
    expect(spec.until).toBe(until.toISOString());
  });
});
