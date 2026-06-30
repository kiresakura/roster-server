/// Pure utilities for leave overlap checks. Kept separate from the service
/// layer so unit tests run without the NestJS/Prisma stack.

export interface LeaveWindow {
  userId: string;
  startAt: Date;
  endAt: Date;
}

export function isUserOnLeave(leaves: LeaveWindow[], userId: string, at: Date): boolean {
  return leaves.some(l => l.userId === userId && l.startAt <= at && l.endAt >= at);
}
