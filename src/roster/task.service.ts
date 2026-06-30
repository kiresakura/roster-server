import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma, Task } from '@prisma/client';

import { BadRequest, NotFound } from '../common/exceptions';
import { decideCompletionEffects, TaskSnapshot } from '../domain/completion';
import { TaskStatus, TaskType } from '../domain/enums';
import { expandRecurrence, isRecurringSpec, RecurrenceSpec } from '../domain/recurrence';
import {
  assertCreateInputValid,
  DomainValidationError,
  normalizeRecurrence,
} from '../domain/validation';
import { JobName } from '../queue/queue.constants';
import { JobQueue } from '../queue/job-queue.service';
import { AssignmentRepository } from './assignment.repository';
import { CreateTaskInput, ListTasksFilterInput, UpdateTaskInput } from './gql-types';
import { TaskRepository } from './task.repository';

function rethrowAsBadRequest<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof DomainValidationError) {
      throw new BadRequest({ code: e.code, message: e.message });
    }
    throw e;
  }
}

@Injectable()
export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly assignments: AssignmentRepository,
    private readonly queue: JobQueue
  ) {}

  isEnabled(): boolean {
    return true;
  }

  @Transactional()
  async createTask(creatorId: string, input: CreateTaskInput): Promise<Task> {
    rethrowAsBadRequest(() => assertCreateInputValid(input));

    const recurrence = input.recurrence
      ? rethrowAsBadRequest(() => normalizeRecurrence(input.recurrence!))
      : null;

    const task = await this.tasks.create({
      creatorId,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      importance: input.importance ?? false,
      completionMode: input.type === TaskType.TASK ? input.completionMode! : null,
      startAt: input.startAt,
      dueAt: input.dueAt ?? null,
      recurrence: (recurrence as unknown as Prisma.InputJsonValue) ?? null,
    });
    await this.assignments.createMany(task.id, input.assigneeIds);
    return task;
  }

  @Transactional()
  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
    const existing = await this.tasks.findById(taskId);
    if (!existing) {
      throw new NotFound('Task not found.');
    }

    if (input.assigneeIds !== undefined && input.assigneeIds !== null) {
      if (input.assigneeIds.length === 0) {
        throw new BadRequest({
          code: 'no_assignee',
          message: 'A task must have at least one assignee.',
        });
      }
    }

    if (existing.type === TaskType.TASK && input.completionMode === null) {
      throw new BadRequest({
        code: 'completion_mode_required',
        message: 'TASK type requires completionMode (ANY or ALL).',
      });
    }

    const recurrence = input.recurrence
      ? rethrowAsBadRequest(() => normalizeRecurrence(input.recurrence!))
      : input.recurrence;

    const updated = await this.tasks.update(taskId, {
      title: input.title,
      description: input.description,
      importance: input.importance,
      completionMode: input.completionMode,
      startAt: input.startAt,
      dueAt: input.dueAt,
      recurrence: recurrence as unknown as Prisma.InputJsonValue,
      status: input.status,
    });
    if (input.assigneeIds) {
      await this.assignments.replaceAssignees(taskId, input.assigneeIds);
    }
    return updated;
  }

  async deleteTask(taskId: string): Promise<void> {
    const existing = await this.tasks.findById(taskId);
    if (!existing) {
      throw new NotFound('Task not found.');
    }
    await this.tasks.delete(taskId);
  }

  listTasks(filter: ListTasksFilterInput) {
    return this.tasks.list({
      type: filter.type ?? undefined,
      status: filter.status ?? undefined,
      rangeFrom: filter.rangeFrom ?? undefined,
      rangeTo: filter.rangeTo ?? undefined,
      assigneeId: filter.assigneeId ?? undefined,
    });
  }

  async expandTaskOccurrences(task: Task, from: Date, to: Date): Promise<Date[]> {
    const spec = task.recurrence as RecurrenceSpec | null;
    if (!isRecurringSpec(spec ?? undefined)) {
      return task.startAt >= from && task.startAt <= to ? [task.startAt] : [];
    }
    return expandRecurrence(task.startAt, spec!, from, to);
  }

  /// Mark `userId`'s assignment for `taskId` complete. Enforces multi-assignee
  /// semantics (ANY/ALL) and enqueues notify jobs for peers when the task wraps.
  @Transactional()
  async completeAssignment(taskId: string, userId: string): Promise<Task> {
    const task = await this.tasks.findById(taskId);
    if (!task) throw new NotFound('Task not found.');
    if (task.status !== TaskStatus.OPEN && task.status !== TaskStatus.OVERDUE) {
      throw new BadRequest({
        code: 'task_not_open',
        message: 'Task is no longer open for completion.',
      });
    }

    const snapshot: TaskSnapshot = {
      id: task.id,
      type: task.type,
      completionMode: task.completionMode,
      assignments: task.assignments.map(a => ({
        id: a.id,
        userId: a.userId,
        status: a.status,
      })),
    };
    const effects = decideCompletionEffects(snapshot, userId);

    const own = snapshot.assignments.find(a => a.userId === userId)!;
    await this.assignments.markStatus(own.id, effects.assignmentNewStatus);

    if (effects.taskCompleted) {
      await this.tasks.update(taskId, { status: TaskStatus.COMPLETED });
    }

    for (const notifyUserId of effects.notifyUserIds) {
      await this.queue.add(
        JobName.NotifyTaskWrapped,
        { taskId, notifyUserId, completerUserId: userId },
        { jobId: `roster:wrap:${taskId}:${notifyUserId}` }
      );
    }

    return (await this.tasks.findById(taskId))!;
  }
}
