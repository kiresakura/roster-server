import {
  Field,
  GraphQLISODateTime,
  ID,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';

import {
  AssignmentStatus,
  CompletionMode,
  LeaveStatus,
  RecurrenceKind,
  TaskStatus,
  TaskType,
} from '../domain/enums';

registerEnumType(TaskType, { name: 'TaskType' });
registerEnumType(CompletionMode, { name: 'CompletionMode' });
registerEnumType(TaskStatus, { name: 'TaskStatus' });
registerEnumType(AssignmentStatus, { name: 'AssignmentStatus' });
registerEnumType(LeaveStatus, { name: 'LeaveStatus' });
registerEnumType(RecurrenceKind, { name: 'RecurrenceKind' });

@ObjectType()
export class HealthObject {
  @Field()
  ok!: boolean;

  @Field()
  enabled!: boolean;
}

@InputType()
export class RecurrenceInput {
  @Field(() => RecurrenceKind)
  kind!: RecurrenceKind;

  @Field(() => [Int], { nullable: true })
  byWeekday?: number[] | null;

  @Field(() => Int, { nullable: true })
  byMonthDay?: number | null;

  @Field(() => Int, { nullable: true })
  nth?: number | null;

  @Field(() => Int, { nullable: true })
  weekday?: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  until?: Date | null;
}

@ObjectType()
export class AssignmentObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  taskId!: string;

  @Field(() => ID)
  userId!: string;

  @Field(() => AssignmentStatus)
  status!: AssignmentStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  reportedAt?: Date | null;
}

@ObjectType()
export class TaskObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  creatorId!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => TaskType)
  type!: TaskType;

  @Field()
  importance!: boolean;

  @Field(() => CompletionMode, { nullable: true })
  completionMode?: CompletionMode | null;

  @Field(() => GraphQLISODateTime)
  startAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  dueAt?: Date | null;

  @Field(() => GraphQLJSONObject, { nullable: true })
  recurrence?: Record<string, unknown> | null;

  @Field(() => ID, { nullable: true })
  parentTaskId?: string | null;

  @Field(() => TaskStatus)
  status!: TaskStatus;

  @Field(() => [AssignmentObject])
  assignments!: AssignmentObject[];

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@InputType()
export class CreateTaskInput {
  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => TaskType)
  type!: TaskType;

  @Field({ nullable: true })
  importance?: boolean;

  @Field(() => CompletionMode, { nullable: true })
  completionMode?: CompletionMode | null;

  @Field(() => GraphQLISODateTime)
  startAt!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  dueAt?: Date | null;

  @Field(() => RecurrenceInput, { nullable: true })
  recurrence?: RecurrenceInput | null;

  @Field(() => [ID])
  assigneeIds!: string[];
}

@InputType()
export class UpdateTaskInput {
  @Field({ nullable: true })
  title?: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field({ nullable: true })
  importance?: boolean;

  @Field(() => CompletionMode, { nullable: true })
  completionMode?: CompletionMode | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  startAt?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  dueAt?: Date | null;

  @Field(() => RecurrenceInput, { nullable: true })
  recurrence?: RecurrenceInput | null;

  @Field(() => TaskStatus, { nullable: true })
  status?: TaskStatus;

  @Field(() => [ID], { nullable: true })
  assigneeIds?: string[] | null;
}

@ObjectType()
export class UserPrefObject {
  @Field(() => ID)
  userId!: string;

  @Field()
  isSupervisor!: boolean;

  @Field(() => Boolean)
  hasTelegramChat!: boolean;

  @Field(() => Int)
  reminderLeadMinutes!: number;
}

@ObjectType()
export class TelegramBindObject {
  @Field()
  token!: string;

  /// Deep link URL the user should open. Empty when bot username isn't
  /// configured — the UI then falls back to showing the raw token.
  @Field()
  deepLinkUrl!: string;

  @Field()
  fallbackCommand!: string;
}

@ObjectType()
export class LeaveRequestObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  userId!: string;

  @Field(() => GraphQLISODateTime)
  startAt!: Date;

  @Field(() => GraphQLISODateTime)
  endAt!: Date;

  @Field(() => String, { nullable: true })
  reason?: string | null;

  @Field(() => LeaveStatus)
  status!: LeaveStatus;

  @Field(() => ID, { nullable: true })
  reviewerId?: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  reviewedAt?: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@InputType()
export class ApplyLeaveInput {
  @Field(() => GraphQLISODateTime)
  startAt!: Date;

  @Field(() => GraphQLISODateTime)
  endAt!: Date;

  @Field(() => String, { nullable: true })
  reason?: string | null;
}

@InputType()
export class ListTasksFilterInput {
  @Field(() => TaskType, { nullable: true })
  type?: TaskType | null;

  @Field(() => TaskStatus, { nullable: true })
  status?: TaskStatus | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  rangeFrom?: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  rangeTo?: Date | null;

  @Field(() => ID, { nullable: true })
  assigneeId?: string | null;
}
