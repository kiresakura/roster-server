import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DailyReviewService } from './daily-review.service';
import { ReminderService } from './reminder.service';
import { TelegramService } from './telegram.service';

/// Time-driven triggers. The heavy per-user work is handed to the queue; these
/// just scan and enqueue, so a slow tick never blocks the event loop.
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly reminder: ReminderService,
    private readonly dailyReview: DailyReviewService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reminderScanCron() {
    if (!this.telegram.isEnabled()) return;
    try {
      const count = await this.reminder.scanAndEnqueue();
      if (count > 0) this.logger.debug(`Enqueued ${count} reminder(s).`);
    } catch (e) {
      this.logger.error('Reminder scan failed', e);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async overdueScanCron() {
    if (!this.telegram.isEnabled()) return;
    try {
      const count = await this.dailyReview.runOverdueCheck();
      if (count > 0) this.logger.log(`Marked ${count} task(s) overdue.`);
    } catch (e) {
      this.logger.error('Overdue scan failed', e);
    }
  }
}
