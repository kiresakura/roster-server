import { Module } from '@nestjs/common';

import { AssignmentRepository } from './assignment.repository';
import { DailyReviewService } from './daily-review.service';
import { LeaveRepository } from './leave.repository';
import { LeaveService } from './leave.service';
import { ReminderService } from './reminder.service';
import { RosterQueueProcessor } from './queue-processor';
import { RosterResolver } from './roster.resolver';
import { SchedulerService } from './scheduler';
import { TaskRepository } from './task.repository';
import { TaskService } from './task.service';
import { TelegramService } from './telegram.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { UserPrefRepository } from './user-pref.repository';
import { UserRepository } from './user.repository';

@Module({
  controllers: [TelegramWebhookController],
  providers: [
    // Repositories
    TaskRepository,
    AssignmentRepository,
    UserPrefRepository,
    LeaveRepository,
    UserRepository,
    // Services
    TaskService,
    LeaveService,
    TelegramService,
    ReminderService,
    DailyReviewService,
    // Time + queue + API
    SchedulerService,
    RosterQueueProcessor,
    RosterResolver,
  ],
})
export class RosterModule {}
