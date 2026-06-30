import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';

import { RosterConfig } from '../config/roster-config';
import { JobQueue } from './job-queue.service';
import { ROSTER_QUEUE } from './queue.constants';

function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
  };
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [RosterConfig],
      useFactory: (config: RosterConfig) => ({
        connection: redisConnection(config.redisUrl),
      }),
    }),
    BullModule.registerQueue({ name: ROSTER_QUEUE }),
  ],
  providers: [JobQueue],
  exports: [JobQueue, BullModule],
})
export class QueueModule {}
