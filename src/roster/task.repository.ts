import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { CompletionMode, Prisma, Task, TaskStatus, TaskType } from '@prisma/client';

import { BaseRepository } from '../prisma/base.repository';

export type { Task };

export interface CreateTaskData {
  creatorId: string;
  title: string;
  description?: string | null;
  type: TaskType;
  importance?: boolean;
  completionMode?: CompletionMode | null;
  startAt: Date;
  dueAt?: Date | null;
  recurrence?: Prisma.InputJsonValue | null;
  parentTaskId?: string | null;
}

export interface UpdateTaskData {
  title?: string;
  description?: string | null;
  importance?: boolean;
  completionMode?: CompletionMode | null;
  startAt?: Date;
  dueAt?: Date | null;
  recurrence?: Prisma.InputJsonValue | null;
  status?: TaskStatus;
}

export interface ListTaskFilter {
  type?: TaskType;
  status?: TaskStatus;
  rangeFrom?: Date;
  rangeTo?: Date;
  assigneeId?: string;
}

@Injectable()
export class TaskRepository extends BaseRepository {
  constructor(txHost: TransactionHost<TransactionalAdapterPrisma>) {
    super(txHost);
  }

  create(input: CreateTaskData) {
    return this.db.task.create({
      data: {
        creatorId: input.creatorId,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        importance: input.importance ?? false,
        completionMode: input.completionMode ?? null,
        startAt: input.startAt,
        dueAt: input.dueAt ?? null,
        recurrence: input.recurrence ?? Prisma.JsonNull,
        parentTaskId: input.parentTaskId ?? null,
      },
    });
  }

  findById(id: string) {
    return this.db.task.findUnique({
      where: { id },
      include: { assignments: true },
    });
  }

  list(filter: ListTaskFilter = {}) {
    const where: Prisma.TaskWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    if (filter.rangeFrom || filter.rangeTo) {
      where.startAt = {};
      if (filter.rangeFrom) where.startAt.gte = filter.rangeFrom;
      if (filter.rangeTo) where.startAt.lte = filter.rangeTo;
    }
    if (filter.assigneeId) {
      where.assignments = { some: { userId: filter.assigneeId } };
    }
    return this.db.task.findMany({
      where,
      include: { assignments: true },
      orderBy: { startAt: 'asc' },
    });
  }

  update(id: string, input: UpdateTaskData) {
    const data: Prisma.TaskUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.importance !== undefined) data.importance = input.importance;
    if (input.completionMode !== undefined) data.completionMode = input.completionMode;
    if (input.startAt !== undefined) data.startAt = input.startAt;
    if (input.dueAt !== undefined) data.dueAt = input.dueAt;
    if (input.recurrence !== undefined) {
      data.recurrence = input.recurrence ?? Prisma.JsonNull;
    }
    if (input.status !== undefined) data.status = input.status;
    return this.db.task.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.db.task.delete({ where: { id } });
  }
}
