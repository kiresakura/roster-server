import type { Queue } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { JobQueue } from '../src/queue/job-queue.service';
import { JobName } from '../src/queue/queue.constants';

describe('JobQueue.add', () => {
  it('hands BullMQ job ids without ":", which BullMQ 5 rejects ("Custom Id cannot contain :")', async () => {
    const jobIds: (string | undefined)[] = [];
    const queue = new JobQueue({
      add: async (_name: string, _payload: unknown, opts: { jobId?: string }) => {
        jobIds.push(opts.jobId);
      },
    } as unknown as Queue);

    const iso = '2026-03-02T09:00:00.000Z';
    await queue.add(
      JobName.SendReminder,
      { taskId: 't1', userId: 'u1', occurrenceAtIso: iso },
      { jobId: `roster:reminder:t1:u1:${iso}` }
    );
    await queue.add(
      JobName.NotifyTaskWrapped,
      { taskId: 't1', notifyUserId: 'u2', completerUserId: 'u1' },
      { jobId: 'roster:wrap:t1:u2' }
    );

    expect(jobIds).toEqual(['roster_reminder_t1_u1_2026-03-02T09_00_00.000Z', 'roster_wrap_t1_u2']);
  });
});
