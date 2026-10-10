import { Prisma, PrismaClient } from '@prisma/client';

import { AuthService } from '../src/auth/auth.service';
import { loadEnvFileIfPresent } from '../src/config/env-file';
import { CompletionMode, LeaveStatus, RecurrenceKind, TaskType } from '../src/domain/enums';
import { normalizeRecurrence, RecurrenceInputShape } from '../src/domain/validation';

loadEnvFileIfPresent();
const prisma = new PrismaClient();

interface DemoTask {
  title: string;
  type: TaskType;
  completionMode?: CompletionMode;
  importance?: boolean;
  startAt: Date;
  dueAt?: Date;
  recurrence?: RecurrenceInputShape;
}

/// Seeds a small demo team (password: `password123`) so you can log in and
/// exercise the API immediately:
///   supervisor@roster.local  — can approve/reject leave
///   member@roster.local      — a regular team member
///   leo@roster.local         — a regular team member, on approved leave tomorrow
/// plus a handful of tasks and leave requests. Safe to re-run: every record
/// has a fixed id and is only created once.
async function main(): Promise<void> {
  const passwordHash = AuthService.hashPassword('password123');

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@roster.local' },
    update: {},
    create: {
      email: 'supervisor@roster.local',
      name: 'Sam Supervisor',
      passwordHash,
      pref: { create: { isSupervisor: true } },
    },
  });

  const member = await prisma.user.upsert({
    where: { email: 'member@roster.local' },
    update: {},
    create: {
      email: 'member@roster.local',
      name: 'Mia Member',
      passwordHash,
      pref: { create: { isSupervisor: false } },
    },
  });

  const leo = await prisma.user.upsert({
    where: { email: 'leo@roster.local' },
    update: {},
    create: {
      email: 'leo@roster.local',
      name: 'Leo Member',
      passwordHash,
      pref: { create: { isSupervisor: false } },
    },
  });

  const team = [member.id, leo.id];

  await seedTask('demo-standup', supervisor.id, team, {
    title: 'Morning stand-up',
    type: TaskType.TASK,
    completionMode: CompletionMode.ANY,
    startAt: localAt(1, 9, 30),
    recurrence: { kind: RecurrenceKind.WEEKLY, byWeekday: [1, 2, 3, 4, 5] },
  });
  await seedTask('demo-expense-report', supervisor.id, team, {
    title: 'Submit the expense report',
    type: TaskType.TASK,
    completionMode: CompletionMode.ANY,
    importance: true,
    startAt: localAt(1, 11, 0),
    dueAt: localAt(1, 17, 0),
  });
  await seedTask('demo-status-report', supervisor.id, team, {
    title: 'Weekly status report',
    type: TaskType.TASK,
    completionMode: CompletionMode.ALL,
    startAt: localAt(1, 16, 0),
    recurrence: { kind: RecurrenceKind.WEEKLY, byWeekday: [5] },
  });
  await seedTask('demo-retro', supervisor.id, [supervisor.id, ...team], {
    title: 'Monthly retro',
    type: TaskType.REMINDER,
    startAt: localAt(1, 15, 0),
    recurrence: { kind: RecurrenceKind.MONTHLY_BY_NTH_WEEKDAY, nth: -1, weekday: 5 },
  });

  await prisma.leaveRequest.upsert({
    where: { id: 'demo-leave-leo' },
    update: {},
    create: {
      id: 'demo-leave-leo',
      userId: leo.id,
      startAt: localAt(1, 0, 0),
      endAt: localAt(1, 23, 59),
      reason: 'Family event',
      status: LeaveStatus.APPROVED,
      reviewerId: supervisor.id,
      reviewedAt: new Date(),
    },
  });
  await prisma.leaveRequest.upsert({
    where: { id: 'demo-leave-mia' },
    update: {},
    create: {
      id: 'demo-leave-mia',
      userId: member.id,
      startAt: localAt(7, 0, 0),
      endAt: localAt(7, 23, 59),
      reason: 'Dentist appointment',
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    [
      'Seeded demo team (password: password123):',
      `  ${supervisor.email}  id=${supervisor.id}  (supervisor)`,
      `  ${member.email}      id=${member.id}`,
      `  ${leo.email}         id=${leo.id}  (approved leave tomorrow)`,
      'Seeded 4 tasks and 2 leave requests (one approved, one pending).',
    ].join('\n')
  );
}

async function seedTask(
  id: string,
  creatorId: string,
  assigneeIds: string[],
  { recurrence, ...fields }: DemoTask
): Promise<void> {
  await prisma.task.upsert({
    where: { id },
    update: {},
    create: {
      id,
      creatorId,
      ...fields,
      recurrence: recurrence
        ? (normalizeRecurrence(recurrence) as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
  await prisma.taskAssignment.createMany({
    data: assigneeIds.map(userId => ({ taskId: id, userId })),
    skipDuplicates: true,
  });
}

/// 伺服器本地時間：今天往後第 `days` 天的 `hours:minutes`。
function localAt(days: number, hours: number, minutes: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

main()
  .catch(e => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
