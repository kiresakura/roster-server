/// Single source of truth for the persisted enums: re-exported from the Prisma
/// client so the domain, GraphQL and data layers all speak exactly one type
/// (Prisma generates these as string-literal unions, so they stay structurally
/// compatible with plain strings — no nominal-enum friction across layers).
///
/// `RecurrenceKind` is the exception: recurrence is stored as JSONB, so there is
/// no DB enum for it and it lives here as a plain enum.
export {
  TaskType,
  CompletionMode,
  TaskStatus,
  AssignmentStatus,
  LeaveStatus,
} from '@prisma/client';

export enum RecurrenceKind {
  NONE = 'NONE',
  WEEKLY = 'WEEKLY',
  MONTHLY_BY_DATE = 'MONTHLY_BY_DATE',
  MONTHLY_BY_NTH_WEEKDAY = 'MONTHLY_BY_NTH_WEEKDAY',
}
