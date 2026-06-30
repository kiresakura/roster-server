import { Injectable } from '@nestjs/common';
import { LeaveStatus } from '@prisma/client';

import { BadRequest, NotFound } from '../common/exceptions';
import { LeaveRepository } from './leave.repository';
import { UserPrefRepository } from './user-pref.repository';

export { isUserOnLeave, type LeaveWindow } from '../domain/leave';

@Injectable()
export class LeaveService {
  constructor(
    private readonly leaves: LeaveRepository,
    private readonly userPrefs: UserPrefRepository
  ) {}

  async apply(userId: string, startAt: Date, endAt: Date, reason?: string | null) {
    if (endAt < startAt) {
      throw new BadRequest({
        code: 'invalid_leave_window',
        message: 'endAt must be >= startAt.',
      });
    }
    return this.leaves.create({ userId, startAt, endAt, reason });
  }

  async approve(leaveId: string, reviewerId: string) {
    await this.assertReviewerIsSupervisor(reviewerId);
    const leave = await this.leaves.findById(leaveId);
    if (!leave) throw new NotFound('Leave request not found.');
    if (leave.status !== LeaveStatus.PENDING) {
      throw new BadRequest({
        code: 'leave_already_reviewed',
        message: 'Leave request is no longer pending.',
      });
    }
    return this.leaves.review(leaveId, reviewerId, LeaveStatus.APPROVED);
  }

  async reject(leaveId: string, reviewerId: string) {
    await this.assertReviewerIsSupervisor(reviewerId);
    const leave = await this.leaves.findById(leaveId);
    if (!leave) throw new NotFound('Leave request not found.');
    if (leave.status !== LeaveStatus.PENDING) {
      throw new BadRequest({
        code: 'leave_already_reviewed',
        message: 'Leave request is no longer pending.',
      });
    }
    return this.leaves.review(leaveId, reviewerId, LeaveStatus.REJECTED);
  }

  async cancel(leaveId: string, userId: string) {
    const leave = await this.leaves.findById(leaveId);
    if (!leave) throw new NotFound('Leave request not found.');
    if (leave.userId !== userId) {
      throw new BadRequest({
        code: 'leave_not_owner',
        message: 'You can only cancel your own leave requests.',
      });
    }
    if (leave.status !== LeaveStatus.PENDING && leave.status !== LeaveStatus.APPROVED) {
      throw new BadRequest({
        code: 'leave_not_cancellable',
        message: 'Leave request is not cancellable in its current state.',
      });
    }
    return this.leaves.cancelOwn(leaveId, userId);
  }

  listOwn(userId: string) {
    return this.leaves.listByUser(userId);
  }

  async listPendingForSupervisor(reviewerId: string) {
    await this.assertReviewerIsSupervisor(reviewerId);
    return this.leaves.listPending();
  }

  private async assertReviewerIsSupervisor(userId: string) {
    const pref = await this.userPrefs.findByUserId(userId);
    if (!pref?.isSupervisor) {
      throw new BadRequest({
        code: 'not_supervisor',
        message: 'Only supervisors can review leave requests.',
      });
    }
  }
}
