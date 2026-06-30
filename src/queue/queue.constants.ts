export const ROSTER_QUEUE = 'roster';

export enum JobName {
  SendReminder = 'sendReminder',
  NotifyTaskWrapped = 'notifyTaskWrapped',
  DailyReviewForUser = 'dailyReviewForUser',
  NotifyOverdueToSupervisor = 'notifyOverdueToSupervisor',
}

export interface JobPayloads {
  [JobName.SendReminder]: { taskId: string; userId: string; occurrenceAtIso: string };
  [JobName.NotifyTaskWrapped]: {
    taskId: string;
    notifyUserId: string;
    completerUserId: string;
  };
  [JobName.DailyReviewForUser]: { userId: string };
  [JobName.NotifyOverdueToSupervisor]: { taskId: string; supervisorUserId: string };
}
