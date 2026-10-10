import { describe, expect, it } from 'vitest';

import { decideCompletionEffects, TaskSnapshot } from '../src/domain/completion';
import { CompletionMode, TaskType } from '../src/domain/enums';

function task(partial: Partial<TaskSnapshot> & Pick<TaskSnapshot, 'completionMode' | 'assignments'>): TaskSnapshot {
  return { id: 't1', type: TaskType.TASK, ...partial };
}

describe('decideCompletionEffects — ANY mode', () => {
  it('completes the task and notifies peers who had not started', () => {
    const t = task({
      completionMode: CompletionMode.ANY,
      assignments: [
        { id: 'a1', userId: 'u1', status: 'NOT_STARTED' },
        { id: 'a2', userId: 'u2', status: 'NOT_STARTED' },
        { id: 'a3', userId: 'u3', status: 'COMPLETED' },
      ],
    });
    const effects = decideCompletionEffects(t, 'u1');
    expect(effects.taskCompleted).toBe(true);
    expect(effects.assignmentNewStatus).toBe('COMPLETED');
    // u2 not started → notify; u3 already completed → no notify; self → no notify.
    expect(effects.notifyUserIds).toEqual(['u2']);
  });

  it('does not tell peers who are away on leave to stand down', () => {
    const t = task({
      completionMode: CompletionMode.ANY,
      assignments: [
        { id: 'a1', userId: 'u1', status: 'NOT_STARTED' },
        { id: 'a2', userId: 'u2', status: 'SKIPPED_ON_LEAVE' },
        { id: 'a3', userId: 'u3', status: 'NOT_STARTED' },
      ],
    });
    expect(decideCompletionEffects(t, 'u3').notifyUserIds).toEqual(['u1']);
  });
});

describe('decideCompletionEffects — ALL mode', () => {
  it('does not complete the task while others are still outstanding', () => {
    const t = task({
      completionMode: CompletionMode.ALL,
      assignments: [
        { id: 'a1', userId: 'u1', status: 'NOT_STARTED' },
        { id: 'a2', userId: 'u2', status: 'NOT_STARTED' },
      ],
    });
    const effects = decideCompletionEffects(t, 'u1');
    expect(effects.taskCompleted).toBe(false);
    expect(effects.notifyUserIds).toEqual([]);
  });

  it('completes the task when every other assignee is COMPLETED or SKIPPED_ON_LEAVE', () => {
    const t = task({
      completionMode: CompletionMode.ALL,
      assignments: [
        { id: 'a1', userId: 'u1', status: 'NOT_STARTED' },
        { id: 'a2', userId: 'u2', status: 'COMPLETED' },
        { id: 'a3', userId: 'u3', status: 'SKIPPED_ON_LEAVE' },
      ],
    });
    const effects = decideCompletionEffects(t, 'u1');
    expect(effects.taskCompleted).toBe(true);
  });

  it('keeps the task open while any peer still owes their part, even if another is on leave', () => {
    const t = task({
      completionMode: CompletionMode.ALL,
      assignments: [
        { id: 'a1', userId: 'u1', status: 'NOT_STARTED' },
        { id: 'a2', userId: 'u2', status: 'SKIPPED_ON_LEAVE' },
        { id: 'a3', userId: 'u3', status: 'NOT_STARTED' },
      ],
    });
    expect(decideCompletionEffects(t, 'u1').taskCompleted).toBe(false);
  });

  it('completes immediately for a single assignee', () => {
    const t = task({
      completionMode: CompletionMode.ALL,
      assignments: [{ id: 'a1', userId: 'u1', status: 'NOT_STARTED' }],
    });
    expect(decideCompletionEffects(t, 'u1')).toEqual({
      assignmentNewStatus: 'COMPLETED',
      taskCompleted: true,
      notifyUserIds: [],
    });
  });
});

describe('decideCompletionEffects — guards', () => {
  it('throws for REMINDER tasks', () => {
    const t = task({ completionMode: null, assignments: [{ id: 'a1', userId: 'u1', status: 'NOT_STARTED' }] });
    t.type = TaskType.REMINDER;
    expect(() => decideCompletionEffects(t, 'u1')).toThrow(/REMINDER/);
  });

  it('throws when the completer is not assigned', () => {
    const t = task({
      completionMode: CompletionMode.ANY,
      assignments: [{ id: 'a1', userId: 'u1', status: 'NOT_STARTED' }],
    });
    expect(() => decideCompletionEffects(t, 'stranger')).toThrow(/not assigned/);
  });

  it('throws when a TASK has no completionMode', () => {
    const t = task({
      completionMode: null,
      assignments: [{ id: 'a1', userId: 'u1', status: 'NOT_STARTED' }],
    });
    expect(() => decideCompletionEffects(t, 'u1')).toThrow(/completionMode/);
  });
});
