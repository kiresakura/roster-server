import { Injectable } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { AssignmentStatus, Prisma, TaskAssignment } from '@prisma/client';

import { BaseRepository } from '../prisma/base.repository';

export type { TaskAssignment };

@Injectable()
export class AssignmentRepository extends BaseRepository {
  constructor(txHost: TransactionHost<TransactionalAdapterPrisma>) {
    super(txHost);
  }

  createMany(taskId: string, userIds: string[]) {
    if (userIds.length === 0) return Promise.resolve({ count: 0 });
    const unique = Array.from(new Set(userIds));
    return this.db.taskAssignment.createMany({
      data: unique.map(userId => ({ taskId, userId })),
      skipDuplicates: true,
    });
  }

  findById(id: string) {
    return this.db.taskAssignment.findUnique({ where: { id } });
  }

  listByTask(taskId: string) {
    return this.db.taskAssignment.findMany({ where: { taskId } });
  }

  listByUser(userId: string, status?: AssignmentStatus) {
    const where: Prisma.TaskAssignmentWhereInput = { userId };
    if (status) where.status = status;
    return this.db.taskAssignment.findMany({
      where,
      include: { task: true },
      orderBy: { task: { startAt: 'asc' } },
    });
  }

  markStatus(assignmentId: string, status: AssignmentStatus) {
    return this.db.taskAssignment.update({
      where: { id: assignmentId },
      data: {
        status,
        reportedAt: status === AssignmentStatus.NOT_STARTED ? null : new Date(),
      },
    });
  }

  findUserAssignment(taskId: string, userId: string) {
    return this.db.taskAssignment.findUnique({
      where: { taskId_userId: { taskId, userId } },
    });
  }

  @Transactional()
  async replaceAssignees(taskId: string, userIds: string[]) {
    const unique = Array.from(new Set(userIds));
    await this.db.taskAssignment.deleteMany({
      where: { taskId, userId: { notIn: unique } },
    });
    if (unique.length) {
      await this.db.taskAssignment.createMany({
        data: unique.map(userId => ({ taskId, userId })),
        skipDuplicates: true,
      });
    }
  }
}
