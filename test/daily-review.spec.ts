import { describe, expect, it } from 'vitest';

import {
  composeDailyReviewMessage,
  DailyTaskItem,
  OverdueTaskCandidate,
  selectOverdueImportant,
} from '../src/domain/daily-review';

const at = (iso: string) => new Date(iso);

describe('composeDailyReviewMessage', () => {
  it('says so when nothing is scheduled', () => {
    const { text, outstandingAssignmentIds } = composeDailyReviewMessage([]);
    expect(text).toContain('No tasks scheduled today');
    expect(outstandingAssignmentIds).toEqual([]);
  });

  it('marks each item, escapes titles, and asks to confirm overdue important tasks', () => {
    const item = (partial: Partial<DailyTaskItem>): DailyTaskItem => ({
      taskId: 't',
      title: 'Task',
      occurrenceAt: at('2026-03-02T09:00:00'),
      importance: false,
      status: 'NOT_STARTED',
      assignmentId: 'a',
      type: 'TASK',
      ...partial,
    });
    const items = [
      item({ title: 'Stand-up', occurrenceAt: at('2026-03-02T09:30:00'), status: 'COMPLETED', assignmentId: 'a1' }),
      item({ title: 'Pay <vendor> & co', occurrenceAt: at('2026-03-02T11:00:00'), importance: true, assignmentId: 'a2' }),
      item({ title: 'Water plants', occurrenceAt: at('2026-03-02T12:00:00'), type: 'REMINDER', assignmentId: 'a3' }),
      item({ title: 'Ship release', occurrenceAt: at('2026-03-02T17:00:00'), importance: true, assignmentId: 'a4' }),
    ];

    const { text, outstandingAssignmentIds } = composeDailyReviewMessage(items, at('2026-03-02T12:30:00'));

    expect(text.split('\n')).toEqual([
      '☀️ <b>Daily review</b> — 4 item(s) today',
      '✅ <code>09:30</code> Stand-up',
      '❗ <code>11:00</code> Pay &lt;vendor&gt; &amp; co',
      '🔔 <code>12:00</code> Water plants',
      '❗ <code>17:00</code> Ship release',
      '',
      '<b>1</b> important task(s) still need your confirmation. Tap below.',
    ]);
    // Only the important task whose time has already passed needs a tap; 17:00 is still ahead.
    expect(outstandingAssignmentIds).toEqual(['a2']);
  });
});

describe('selectOverdueImportant', () => {
  const now = at('2026-03-02T12:00:00');
  const candidate = (partial: Partial<OverdueTaskCandidate> & Pick<OverdueTaskCandidate, 'taskId'>) => ({
    title: partial.taskId,
    startAt: at('2026-03-02T09:00:00'),
    dueAt: null,
    importance: true,
    status: 'OPEN' as const,
    hasOpenAssignment: true,
    ...partial,
  });

  it('flags only important, still-open tasks whose deadline has passed', () => {
    const picked = selectOverdueImportant(
      [
        candidate({ taskId: 'due-passed', dueAt: at('2026-03-02T11:00:00') }),
        candidate({ taskId: 'no-due-start-passed' }),
        candidate({ taskId: 'due-later', dueAt: at('2026-03-02T18:00:00') }),
        candidate({ taskId: 'not-important', importance: false }),
        candidate({ taskId: 'already-overdue', status: 'OVERDUE' }),
        candidate({ taskId: 'everyone-reported', hasOpenAssignment: false }),
      ],
      now
    );
    expect(picked.map(c => c.taskId)).toEqual(['due-passed', 'no-due-start-passed']);
  });
});
