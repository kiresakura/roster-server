import { CompletionMode, RecurrenceKind, TaskType } from './enums';
import { RecurrenceSpec } from './recurrence';

/// Structural shapes the validators operate on. The GraphQL input classes
/// (src/roster/gql-types.ts) are compatible supersets of these, so the pure
/// domain never imports the framework layer.
export interface RecurrenceInputShape {
  kind: RecurrenceKind;
  byWeekday?: number[] | null;
  byMonthDay?: number | null;
  nth?: number | null;
  weekday?: number | null;
  until?: Date | null;
}

export interface CreateTaskInputShape {
  type: TaskType;
  completionMode?: CompletionMode | null;
  startAt: Date;
  dueAt?: Date | null;
  recurrence?: RecurrenceInputShape | null;
  assigneeIds: string[];
}

/// Pure validation error. The service layer translates this into the API's
/// `BadRequest` exception, so pure-function tests can run without pulling in
/// the NestJS/Prisma layers.
export class DomainValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'DomainValidationError';
  }
}

export function assertCreateInputValid(input: CreateTaskInputShape): void {
  if (!input.assigneeIds || input.assigneeIds.length === 0) {
    throw new DomainValidationError('no_assignee', 'A task must have at least one assignee.');
  }
  if (input.type === TaskType.TASK) {
    if (!input.completionMode) {
      throw new DomainValidationError(
        'completion_mode_required',
        'TASK type requires completionMode (ANY or ALL).'
      );
    }
  } else if (input.type === TaskType.REMINDER) {
    if (input.completionMode != null) {
      throw new DomainValidationError(
        'reminder_no_completion_mode',
        'REMINDER type must not have completionMode.'
      );
    }
  }
  if (input.recurrence) {
    normalizeRecurrence(input.recurrence);
  }
  if (input.dueAt && input.dueAt < input.startAt) {
    throw new DomainValidationError('invalid_due_at', 'dueAt must be >= startAt.');
  }
}

export function normalizeRecurrence(input: RecurrenceInputShape): RecurrenceSpec {
  const spec: RecurrenceSpec = { kind: input.kind };
  switch (input.kind) {
    case RecurrenceKind.NONE:
      break;
    case RecurrenceKind.WEEKLY:
      if (!input.byWeekday?.length) {
        throw new DomainValidationError('recurrence_invalid', 'WEEKLY requires byWeekday.');
      }
      if (input.byWeekday.some(d => d < 0 || d > 6)) {
        throw new DomainValidationError('recurrence_invalid', 'byWeekday entries must be 0..6.');
      }
      spec.byWeekday = Array.from(new Set(input.byWeekday)).sort((a, b) => a - b);
      break;
    case RecurrenceKind.MONTHLY_BY_DATE:
      if (!input.byMonthDay || input.byMonthDay < 1 || input.byMonthDay > 31) {
        throw new DomainValidationError(
          'recurrence_invalid',
          'MONTHLY_BY_DATE requires byMonthDay in 1..31.'
        );
      }
      spec.byMonthDay = input.byMonthDay;
      break;
    case RecurrenceKind.MONTHLY_BY_NTH_WEEKDAY:
      if (input.nth == null || input.nth === 0 || input.nth < -1 || input.nth > 5) {
        throw new DomainValidationError(
          'recurrence_invalid',
          'MONTHLY_BY_NTH_WEEKDAY requires nth in 1..5 or -1.'
        );
      }
      if (input.weekday == null || input.weekday < 0 || input.weekday > 6) {
        throw new DomainValidationError(
          'recurrence_invalid',
          'MONTHLY_BY_NTH_WEEKDAY requires weekday in 0..6.'
        );
      }
      spec.nth = input.nth;
      spec.weekday = input.weekday;
      break;
  }
  if (input.until) {
    spec.until = input.until.toISOString();
  }
  return spec;
}
