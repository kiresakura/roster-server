import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { printSchema } from 'graphql';

import { RosterResolver } from '../src/roster/roster.resolver';

/// Builds the code-first GraphQL schema from the resolver/type decorators and
/// prints the SDL. Validates the entire GraphQL layer (object/input types, enum
/// registration, queries, mutations) with no database or Redis required.
async function main(): Promise<void> {
  const app = await NestFactory.create(GraphQLSchemaBuilderModule, { logger: false });
  await app.init();
  const schemaFactory = app.get(GraphQLSchemaFactory);
  const schema = await schemaFactory.create([RosterResolver]);
  // eslint-disable-next-line no-console
  console.log(printSchema(schema));
  await app.close();
}

void main();
