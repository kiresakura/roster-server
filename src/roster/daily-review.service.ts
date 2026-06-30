import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { TaskStatus } from '@prisma/client';
import { CronJob } from 'cron';

import { RosterConfig } from '../config/roster-config';
import {
  composeDailyReviewMessage,
  DailyTaskItem,
  OverdueTaskCandidate,
  selectOverdueImportant,
} from '../domain/daily-review';
import { RecurrenceKind } from '../domain/enums';
import { isUserOnLeave, LeaveWindow } from '../domain/leave';
import { expandRecurrence, RecurrenceSpec } from '../domain/recurrence';
import { JobName } from '../queue/queue.constants';
import { JobQueue } from '../queue/job-queue.service';
import { LeaveRepository } from './leave.repository';
import { TaskRepository } from './task.repository';
import { TelegramService } from './telegram.service';
import { UserPrefRepository } from './user-pref.repository';

const CRON_JOB_NAME = 'roster.dailyReview';

@Injectable()
export class DailyReviewService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyReviewService.name);

  constructor(
    private readonly config: RosterConfig,
    private readonly tasks: TaskRepository,
    private readonly userPrefs: UserPrefRepository,
    private readonly leaves: LeaveRepository,
    private readonly telegram: TelegramService,
    private readonly queue: JobQueue,
    private readonly scheduler: SchedulerRegistry
  ) {}

  onApplicationBootstrap() {
    const expr = this.config.dailyReview.cron;
    const tz = this.config.dailyReview.timezone;
    try {
      const job = new CronJob(
        expr,
        () => {
          void this.runDailyReview().catch(e => this.logger.error('Daily review failed', e));
        },
        null,
        false,
        tz
      );
      this.scheduler.addCronJob(CRON_JOB_NAME, job as any);
      job.start();
      this.logger.log(`Daily review scheduled: "${expr}" ${tz}`);
    } catch (e) {
      this.logger.error(`Failed to register daily review cron: ${(e as Error).message}`);
    }
  }

  /// Fan out the per-user review work. Each user goes through a queue job so one
  /// slow Telegram round-trip cannot block the others.
  async runDailyReview(now: Date = new Date()): Promise<void> {
    const bound = await this.userPrefs.listBound();
    await Promise.allSettled(
      bound.map(({ userId }) =>
        this.queue.add(
          JobName.DailyReviewForUser,
          { userId },
          { jobId: `roster:dailyReview:${userId}:${now.toISOString().slice(0, 10)}` }
        )
      )
    );
  }

  /// Compose + send the daily summary for a single user. Called from the
  /// `DailyReviewForUser` job handler in the queue processor.
  async sendDailyReviewForUser(userId: string, now: Date = new Date()): Promise<void> {
    const pref = await this.userPrefs.findByUserId(userId);
    if (!pref?.telegramChatId) return;

    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);
    const items = await this.collectTodayItems(userId, dayStart, dayEnd);
    const { text, outstandingAssignmentIds } = composeDailyReviewMessage(items, now);

    const buttons = outstandingAssignmentIds.slice(0, 3).map(id => ({
      text: '✅ Mark complete',
      callback_data: `roster:complete:${id}`,
    }));

    await this.telegram.sendMessage(
      pref.telegramChatId,
      text,
      buttons.length ? buttons : undefined
    );
  }

  /// Overdue scan: pick up any important TASK whose deadline passed without all
  /// assignees reporting. Mark it OVERDUE and tell every supervisor.
  async runOverdueCheck(now: Date = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + 1000); // anything <= now
    const candidates = await this.fetchOverdueCandidates(horizon);
    const overdue = selectOverdueImportant(candidates, now);
    if (overdue.length === 0) return 0;

    const supervisors = await this.userPrefs.listSupervisors();
    for (const task of overdue) {
      await this.tasks.update(task.taskId, { status: TaskStatus.OVERDUE });
      for (const supervisor of supervisors) {
        if (!supervisor.telegramChatId) continue;
        await this.queue.add(
          JobName.NotifyOverdueToSupervisor,
          { taskId: task.taskId, supervisorUserId: supervisor.userId },
          { jobId: `roster:overdue:${task.taskId}:${supervisor.userId}` }
        );
      }
    }
    return overdue.length;
  }

  private async collectTodayItems(
    userId: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<DailyTaskItem[]> {
    const tasks = await this.tasks.list({ assigneeId: userId, rangeTo: dayEnd });
    const leaves: LeaveWindow[] = (
      await this.leaves.listActiveApprovedInWindow(dayStart, dayEnd)
    ).map(l => ({ userId: l.userId, startAt: l.startAt, endAt: l.endAt }));

    const items: DailyTaskItem[] = [];
    for (const task of tasks) {
      const spec = task.recurrence as RecurrenceSpec | null;
      const occurrences =
        spec && spec.kind !== RecurrenceKind.NONE
          ? expandRecurrence(task.startAt, spec, dayStart, dayEnd)
          : task.startAt >= dayStart && task.startAt <= dayEnd
            ? [task.startAt]
            : [];

      const assignment = task.assignments.find(a => a.userId === userId);
      if (!assignment) continue;

      for (const occurrenceAt of occurrences) {
        if (isUserOnLeave(leaves, userId, occurrenceAt)) continue;
        items.push({
          taskId: task.id,
          title: task.title,
          occurrenceAt,
          importance: task.importance,
          status: assignment.status,
          assignmentId: assignment.id,
          type: task.type,
        });
      }
    }
    items.sort((a, b) => a.occurrenceAt.getTime() - b.occurrenceAt.getTime());
    return items;
  }

  private async fetchOverdueCandidates(now: Date): Promise<OverdueTaskCandidate[]> {
    const tasks = await this.tasks.list({ status: TaskStatus.OPEN });
    const out: OverdueTaskCandidate[] = [];
    for (const task of tasks) {
      const hasOpenAssignment = task.assignments.some(a => a.status === 'NOT_STARTED');
      const deadline = task.dueAt ?? task.startAt;
      if (deadline >= now) continue;
      out.push({
        taskId: task.id,
        title: task.title,
        startAt: task.startAt,
        dueAt: task.dueAt,
        importance: task.importance,
        status: task.status,
        hasOpenAssignment,
      });
    }
    return out;
  }
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}
