import { describe, expect, it } from 'vitest';

import { RecurrenceKind } from '../src/domain/enums';
import { LeaveWindow } from '../src/domain/leave';
import type { JobQueue } from '../src/queue/job-queue.service';
import type { LeaveRepository } from '../src/roster/leave.repository';
import { ReminderService } from '../src/roster/reminder.service';
import type { TaskRepository } from '../src/roster/task.repository';
import type { UserPrefRepository } from '../src/roster/user-pref.repository';

const at = (iso: string) => new Date(iso);

// Monday 2026-03-02, 08:30 local — the moment the per-minute scan runs.
const NOW = at('2026-03-02T08:30:00');

interface FakeTask {
  id: string;
  startAt: Date;
  recurrence: Record<string, unknown> | null;
  assignments: { userId: string; status: 'NOT_STARTED' | 'COMPLETED' | 'SKIPPED_ON_LEAVE' }[];
}

/// 以記憶體假資料組出 ReminderService：不需要資料庫、Redis 或 Telegram。
function setup(opts: {
  tasks: FakeTask[];
  leadMinutes: Record<string, number | null>; // null = no Telegram chat bound
  leaves?: LeaveWindow[];
}) {
  const queued: { name: string; payload: unknown; jobId?: string }[] = [];
  const service = new ReminderService(
    { list: async () => opts.tasks } as unknown as TaskRepository,
    {
      findByUserId: async (userId: string) => {
        const lead = opts.leadMinutes[userId];
        return lead == null ? null : { telegramChatId: `chat-${userId}`, reminderLeadMinutes: lead };
      },
    } as unknown as UserPrefRepository,
    { listActiveApprovedInWindow: async () => opts.leaves ?? [] } as unknown as LeaveRepository,
    {
      add: async (name: string, payload: unknown, o?: { jobId?: string }) => {
        queued.push({ name, payload, jobId: o?.jobId });
      },
    } as unknown as JobQueue
  );
  return { service, queued };
}

const oneOff = (assignments: FakeTask['assignments']): FakeTask => ({
  id: 'expense-report',
  startAt: at('2026-03-02T09:00:00'),
  recurrence: null,
  assignments,
});

describe('ReminderService.findDueTriggers', () => {
  it("fires each assignee's reminder exactly their lead time before the start", async () => {
    const { service } = setup({
      tasks: [oneOff([{ userId: 'mia', status: 'NOT_STARTED' }, { userId: 'leo', status: 'NOT_STARTED' }])],
      leadMinutes: { mia: 30, leo: 10 },
    });

    // 09:00 start: Mia (30 min lead) is due now; Leo (10 min lead) is due at 08:50, not yet.
    expect(await service.findDueTriggers(NOW)).toEqual([
      {
        taskId: 'expense-report',
        userId: 'mia',
        occurrenceAt: at('2026-03-02T09:00:00'),
        triggerAt: at('2026-03-02T08:30:00'),
      },
    ]);
  });

  it('skips an assignee who is on approved leave at the occurrence, but still reminds their peer', async () => {
    const { service } = setup({
      tasks: [oneOff([{ userId: 'mia', status: 'NOT_STARTED' }, { userId: 'leo', status: 'NOT_STARTED' }])],
      leadMinutes: { mia: 30, leo: 30 },
      leaves: [{ userId: 'leo', startAt: at('2026-03-02T00:00:00'), endAt: at('2026-03-02T23:59:00') }],
    });

    const triggers = await service.findDueTriggers(NOW);
    expect(triggers.map(t => t.userId)).toEqual(['mia']);
  });

  it('still reminds once the leave has ended before the occurrence', async () => {
    const { service } = setup({
      tasks: [oneOff([{ userId: 'leo', status: 'NOT_STARTED' }])],
      leadMinutes: { leo: 30 },
      leaves: [{ userId: 'leo', startAt: at('2026-03-01T00:00:00'), endAt: at('2026-03-01T23:59:00') }],
    });

    expect((await service.findDueTriggers(NOW)).map(t => t.userId)).toEqual(['leo']);
  });

  it('skips assignees who already reported and users with no Telegram chat bound', async () => {
    const { service } = setup({
      tasks: [
        oneOff([
          { userId: 'mia', status: 'COMPLETED' },
          { userId: 'leo', status: 'NOT_STARTED' },
          { userId: 'kai', status: 'NOT_STARTED' },
        ]),
      ],
      leadMinutes: { mia: 30, leo: null, kai: 30 },
    });

    expect((await service.findDueTriggers(NOW)).map(t => t.userId)).toEqual(['kai']);
  });

  it("expands recurring tasks and reminds for today's occurrence", async () => {
    const { service } = setup({
      tasks: [
        {
          id: 'standup',
          startAt: at('2026-02-23T09:00:00'), // first Monday, a week earlier
          recurrence: { kind: RecurrenceKind.WEEKLY, byWeekday: [1] },
          assignments: [{ userId: 'mia', status: 'NOT_STARTED' }],
        },
      ],
      leadMinutes: { mia: 30 },
    });

    const [trigger] = await service.findDueTriggers(NOW);
    expect(trigger.occurrenceAt).toEqual(at('2026-03-02T09:00:00'));
  });
});

describe('ReminderService.scanAndEnqueue', () => {
  it('enqueues one job per trigger with a deterministic id, so overlapping scans cannot double-send', async () => {
    const { service, queued } = setup({
      tasks: [oneOff([{ userId: 'mia', status: 'NOT_STARTED' }])],
      leadMinutes: { mia: 30 },
    });

    expect(await service.scanAndEnqueue(NOW)).toBe(1);
    await service.scanAndEnqueue(new Date(NOW.getTime() + 10_000));

    const iso = at('2026-03-02T09:00:00').toISOString();
    expect(queued).toEqual([
      {
        name: 'sendReminder',
        payload: { taskId: 'expense-report', userId: 'mia', occurrenceAtIso: iso },
        jobId: `roster:reminder:expense-report:mia:${iso}`,
      },
      {
        name: 'sendReminder',
        payload: { taskId: 'expense-report', userId: 'mia', occurrenceAtIso: iso },
        jobId: `roster:reminder:expense-report:mia:${iso}`,
      },
    ]);
  });
});
