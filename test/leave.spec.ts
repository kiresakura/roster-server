import { describe, expect, it } from 'vitest';

import { isUserOnLeave, LeaveWindow } from '../src/domain/leave';

const at = (iso: string) => new Date(iso);

const leaves: LeaveWindow[] = [
  { userId: 'u1', startAt: at('2026-03-02T00:00:00'), endAt: at('2026-03-02T23:59:00') },
];

describe('isUserOnLeave', () => {
  it('includes both edges of the leave window', () => {
    expect(isUserOnLeave(leaves, 'u1', at('2026-03-02T00:00:00'))).toBe(true);
    expect(isUserOnLeave(leaves, 'u1', at('2026-03-02T12:00:00'))).toBe(true);
    expect(isUserOnLeave(leaves, 'u1', at('2026-03-02T23:59:00'))).toBe(true);
  });

  it('is false just outside the window', () => {
    expect(isUserOnLeave(leaves, 'u1', at('2026-03-01T23:59:59'))).toBe(false);
    expect(isUserOnLeave(leaves, 'u1', at('2026-03-02T23:59:01'))).toBe(false);
  });

  it("ignores other people's leave", () => {
    expect(isUserOnLeave(leaves, 'u2', at('2026-03-02T12:00:00'))).toBe(false);
  });
});
