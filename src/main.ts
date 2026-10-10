import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadEnvFileIfPresent } from './config/env-file';
import { RosterConfig } from './config/roster-config';

async function bootstrap(): Promise<void> {
  loadEnvFileIfPresent();
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableShutdownHooks();

  const config = app.get(RosterConfig);
  await app.listen(config.port);

  new Logger('Bootstrap').log(
    `Roster up on http://localhost:${config.port}  (GraphQL at /graphql)`
  );
}

void bootstrap();
