import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import { JobName, JobPayloads, ROSTER_QUEUE } from './queue.constants';

/// Thin, type-safe wrapper over the BullMQ queue. Mirrors the host platform's
/// `JobQueue.add(name, payload, { jobId })` so a deterministic `jobId` keeps
/// retried/overlapping scans from double-enqueuing the same work.
@Injectable()
export class JobQueue {
  constructor(@InjectQueue(ROSTER_QUEUE) private readonly queue: Queue) {}

  add<N extends JobName>(
    name: N,
    payload: JobPayloads[N],
    opts?: { jobId?: string }
  ): Promise<unknown> {
    return this.queue.add(name, payload, {
      // BullMQ 5 拒收含 `:` 的自訂 jobId（"Custom Id cannot contain :"），統一換成 `_`；
      // 同樣的輸入仍得到同樣的 id，去重效果不變。
      jobId: opts?.jobId?.replaceAll(':', '_'),
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
