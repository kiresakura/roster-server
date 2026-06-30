import { format } from 'node:util';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { Job } from 'bullmq';

import { JobName, JobPayloads, ROSTER_QUEUE } from '../queue/queue.constants';
import { AssignmentRepository } from './assignment.repository';
import { DailyReviewService } from './daily-review.service';
import { TaskRepository } from './task.repository';
import { TelegramService } from './telegram.service';
import { UserPrefRepository } from './user-pref.repository';
import { UserRepository } from './user.repository';

/// Single BullMQ worker fanning out to per-job handlers. Replaces the host
/// platform's `@OnJob` handlers; `process()` switches on the job name.
@Processor(ROSTER_QUEUE)
export class RosterQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(RosterQueueProcessor.name);

  constructor(
    private readonly tasks: TaskRepository,
    private readonly assignments: AssignmentRepository,
    private readonly userPrefs: UserPrefRepository,
    private readonly users: UserRepository,
    private readonly telegram: TelegramService,
    private readonly dailyReview: DailyReviewService
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name as JobName) {
      case JobName.SendReminder:
        return this.sendReminder(job.data);
      case JobName.NotifyTaskWrapped:
        return this.notifyTaskWrapped(job.data);
      case JobName.DailyReviewForUser:
        return this.dailyReview.sendDailyReviewForUser(
          (job.data as JobPayloads[JobName.DailyReviewForUser]).userId
        );
      case JobName.NotifyOverdueToSupervisor:
        return this.notifyOverdueToSupervisor(job.data);
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  private async sendReminder({
    taskId,
    userId,
    occurrenceAtIso,
  }: JobPayloads[JobName.SendReminder]): Promise<void> {
    const [task, pref, assignment] = await Promise.all([
      this.tasks.findById(taskId),
      this.userPrefs.findByUserId(userId),
      this.assignments.findUserAssignment(taskId, userId),
    ]);

    if (!task || !pref?.telegramChatId) return;
    if (assignment?.status === 'COMPLETED') return;

    const occurrenceAt = new Date(occurrenceAtIso);
    const occurrenceLine = format(
      '<i>%s</i>',
      occurrenceAt.toLocaleString('en-US', { hour12: false })
    );
    const importanceTag = task.importance ? '❗ <b>Important</b>' : '🔔 Reminder';
    const text = [
      `${importanceTag}: <b>${escapeHtml(task.title)}</b>`,
      occurrenceLine,
      task.description ? escapeHtml(task.description) : null,
    ]
      .filter(Boolean)
      .join('\n');

    // For important TASKs, surface a Complete button so the user can ack inline.
    const buttons =
      task.type === TaskType.TASK && task.importance && assignment
        ? [{ text: '✅ Mark complete', callback_data: `roster:complete:${assignment.id}` }]
        : undefined;

    await this.telegram.sendMessage(pref.telegramChatId, text, buttons);
  }

  private async notifyTaskWrapped({
    taskId,
    notifyUserId,
    completerUserId,
  }: JobPayloads[JobName.NotifyTaskWrapped]): Promise<void> {
    const [task, pref, completer] = await Promise.all([
      this.tasks.findById(taskId),
      this.userPrefs.findByUserId(notifyUserId),
      this.users.get(completerUserId),
    ]);
    if (!task || !pref?.telegramChatId) return;

    const completerName = completer?.name || completer?.email || 'A teammate';
    const text = [
      `✅ <b>${escapeHtml(task.title)}</b> was completed by ${escapeHtml(completerName)}.`,
      'You can stand down on this one.',
    ].join('\n');
    await this.telegram.sendMessage(pref.telegramChatId, text);
  }

  private async notifyOverdueToSupervisor({
    taskId,
    supervisorUserId,
  }: JobPayloads[JobName.NotifyOverdueToSupervisor]): Promise<void> {
    const [task, pref] = await Promise.all([
      this.tasks.findById(taskId),
      this.userPrefs.findByUserId(supervisorUserId),
    ]);
    if (!task || !pref?.telegramChatId) return;
    const text = [
      `⚠️ <b>Overdue alert</b>`,
      `Important task <b>${escapeHtml(task.title)}</b> has missed its deadline without a complete confirmation.`,
    ].join('\n');
    await this.telegram.sendMessage(pref.telegramChatId, text);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}
