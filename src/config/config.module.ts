import { Global, Module } from '@nestjs/common';

import { RosterConfig } from './roster-config';

@Global()
@Module({
  providers: [{ provide: RosterConfig, useFactory: () => RosterConfig.load() }],
  exports: [RosterConfig],
})
export class ConfigModule {}
