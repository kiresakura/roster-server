import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';

import { isUserOnLeave, LeaveWindow } from '../domain/leave';
import { RecurrenceKind } from '../domain/enums';
import { expandRecurrence, RecurrenceSpec } from '../domain/recurrence';
import { JobName } from '../queue/queue.constants';
import { JobQueue } from '../queue/job-queue.service';
import { LeaveRepository } from './leave.repository';
import { TaskRepository } from './task.repository';
import { UserPrefRepository } from './user-pref.repository';

export interface ReminderTrigger {
  taskId: string;
  userId: string;
  occurrenceAt: Date;
  triggerAt: Date;
}

const SCAN_WINDOW_PAST_MS = 30_000;
const SCAN_WINDOW_FUTURE_MS = 30_000;
const FORWARD_RECURRENCE_DAYS = 7;

@Injectable()
export class ReminderService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly userPrefs: UserPrefRepository,
    private readonly leaves: LeaveRepository,
    private readonly queue: JobQueue
  ) {}

  /// Run by the per-minute cron. Returns the count of reminders enqueued
  /// (useful for observability + tests).
  async scanAndEnqueue(now: Date = new Date()): Promise<number> {
    const triggers = await this.findDueTriggers(now);
    if (triggers.length === 0) return 0;

    await Promise.allSettled(
      triggers.map(trigger =>
        this.queue.add(
          JobName.SendReminder,
          {
            taskId: trigger.taskId,
            userId: trigger.userId,
            occurrenceAtIso: trigger.occurrenceAt.toISOString(),
          },
          {
            // Deterministic id → BullMQ rejects duplicates within retention,
            // so a missed-or-overlapping scan doesn't double-send.
            jobId: `roster:reminder:${trigger.taskId}:${trigger.userId}:${trigger.occurrenceAt.toISOString()}`,
          }
        )
      )
    );
    return triggers.length;
  }

  /// Given current time, find (task, user, occurrence) triples that should fire
  /// a reminder now. Exposed for tests.
  async findDueTriggers(now: Date): Promise<ReminderTrigger[]> {
    const windowStart = new Date(now.getTime() - SCAN_WINDOW_PAST_MS);
    const windowEnd = new Date(now.getTime() + SCAN_WINDOW_FUTURE_MS);

    // Look at any OPEN task whose start or recurrence might reach into the
    // forward window. We over-fetch slightly; the per-user lead-time filter
    // happens below.
    const horizonEnd = new Date(now.getTime() + FORWARD_RECURRENCE_DAYS * 86_400_000);
    const tasks = await this.tasks.list({ status: TaskStatus.OPEN, rangeTo: horizonEnd });

    const approvedLeaves: LeaveWindow[] = (
      await this.leaves.listActiveApprovedInWindow(now, horizonEnd)
    ).map(l => ({ userId: l.userId, startAt: l.startAt, endAt: l.endAt }));

    const userPrefCache = new Map<string, number>();
    const triggers: ReminderTrigger[] = [];

    for (const task of tasks) {
      const assignments = task.assignments;
      if (!assignments?.length) continue;

      const spec = task.recurrence as RecurrenceSpec | null;
      const occurrences =
        spec && spec.kind !== RecurrenceKind.NONE
          ? expandRecurrence(task.startAt, spec, now, horizonEnd)
          : task.startAt >= now
            ? [task.startAt]
            : [];

      if (occurrences.length === 0) continue;

      for (const assignment of assignments) {
        if (assignment.status === 'COMPLETED') continue;
        const lead = await this.getLeadMinutes(assignment.userId, userPrefCache);
        if (lead == null) continue; // user has no telegram chat bound

        for (const occurrenceAt of occurrences) {
          const triggerAt = new Date(occurrenceAt.getTime() - lead * 60_000);
          if (triggerAt < windowStart || triggerAt >= windowEnd) continue;
          // Suppress if the assignee is on approved leave at the occurrence time.
          if (isUserOnLeave(approvedLeaves, assignment.userId, occurrenceAt)) continue;
          triggers.push({ taskId: task.id, userId: assignment.userId, occurrenceAt, triggerAt });
        }
      }
    }
    return triggers;
  }

  /// Returns lead minutes, or null if the user is unreachable (no chat id).
  private async getLeadMinutes(
    userId: string,
    cache: Map<string, number>
  ): Promise<number | null> {
    if (cache.has(userId)) {
      const cached = cache.get(userId)!;
      return cached < 0 ? null : cached;
    }
    const pref = await this.userPrefs.findByUserId(userId);
    if (!pref?.telegramChatId) {
      cache.set(userId, -1);
      return null;
    }
    cache.set(userId, pref.reminderLeadMinutes);
    return pref.reminderLeadMinutes;
  }
}
