import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { LeaveRequest, LeaveStatus, Prisma } from '@prisma/client';

import { BaseRepository } from '../prisma/base.repository';

export type { LeaveRequest };

export interface CreateLeaveData {
  userId: string;
  startAt: Date;
  endAt: Date;
  reason?: string | null;
}

@Injectable()
export class LeaveRepository extends BaseRepository {
  constructor(txHost: TransactionHost<TransactionalAdapterPrisma>) {
    super(txHost);
  }

  create(input: CreateLeaveData) {
    return this.db.leaveRequest.create({
      data: {
        userId: input.userId,
        startAt: input.startAt,
        endAt: input.endAt,
        reason: input.reason ?? null,
      },
    });
  }

  findById(id: string) {
    return this.db.leaveRequest.findUnique({ where: { id } });
  }

  listByUser(userId: string) {
    return this.db.leaveRequest.findMany({
      where: { userId },
      orderBy: { startAt: 'desc' },
    });
  }

  listPending() {
    return this.db.leaveRequest.findMany({
      where: { status: LeaveStatus.PENDING },
      orderBy: { startAt: 'asc' },
    });
  }

  /// Approved leave windows overlapping `[from, to]`. Used by the reminder
  /// scanner to suppress notifications during a user's time off.
  listActiveApprovedInWindow(from: Date, to: Date) {
    return this.db.leaveRequest.findMany({
      where: {
        status: LeaveStatus.APPROVED,
        startAt: { lte: to },
        endAt: { gte: from },
      },
    });
  }

  review(id: string, reviewerId: string, status: LeaveStatus) {
    return this.db.leaveRequest.update({
      where: { id },
      data: { status, reviewerId, reviewedAt: new Date() },
    });
  }

  cancelOwn(id: string, userId: string): Prisma.PrismaPromise<LeaveRequest> {
    return this.db.leaveRequest.update({
      where: { id, userId },
      data: { status: LeaveStatus.CANCELLED },
    });
  }
}
