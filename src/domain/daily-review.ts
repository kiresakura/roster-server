/// Pure utilities for composing the daily-review message and for identifying
/// overdue important tasks. Framework-free so the units test in isolation.

export interface DailyTaskItem {
  taskId: string;
  title: string;
  occurrenceAt: Date;
  importance: boolean;
  status: 'NOT_STARTED' | 'COMPLETED' | 'SKIPPED_ON_LEAVE';
  assignmentId: string;
  type: 'TASK' | 'REMINDER';
}

export interface OverdueTaskCandidate {
  taskId: string;
  title: string;
  startAt: Date;
  dueAt: Date | null;
  importance: boolean;
  status: 'OPEN' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
  /// True when *any* assignee has not yet reported COMPLETED.
  hasOpenAssignment: boolean;
}

/// Compose a Telegram-friendly HTML summary of the user's tasks today.
export function composeDailyReviewMessage(
  items: DailyTaskItem[],
  now: Date = new Date()
): { text: string; outstandingAssignmentIds: string[] } {
  if (items.length === 0) {
    return {
      text: '☀️ <b>Daily review</b>\nNo tasks scheduled today. Enjoy.',
      outstandingAssignmentIds: [],
    };
  }

  const lines: string[] = [`☀️ <b>Daily review</b> — ${items.length} item(s) today`];
  const outstanding: string[] = [];

  for (const it of items) {
    const time = it.occurrenceAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const marker =
      it.status === 'COMPLETED'
        ? '✅'
        : it.importance
          ? '❗'
          : it.type === 'REMINDER'
            ? '🔔'
            : '•';
    lines.push(`${marker} <code>${time}</code> ${escapeHtml(it.title)}`);

    if (
      it.type === 'TASK' &&
      it.importance &&
      it.status === 'NOT_STARTED' &&
      it.occurrenceAt <= now
    ) {
      outstanding.push(it.assignmentId);
    }
  }

  if (outstanding.length > 0) {
    lines.push(
      '',
      `<b>${outstanding.length}</b> important task(s) still need your confirmation. Tap below.`
    );
  }

  return { text: lines.join('\n'), outstandingAssignmentIds: outstanding };
}

/// Filter the candidate list to those that should be transitioned to OVERDUE
/// right now. Caller is expected to flip status + emit notifications.
export function selectOverdueImportant(
  candidates: OverdueTaskCandidate[],
  now: Date = new Date()
): OverdueTaskCandidate[] {
  return candidates.filter(c => {
    if (!c.importance) return false;
    if (c.status !== 'OPEN') return false;
    if (!c.hasOpenAssignment) return false;
    const deadline = c.dueAt ?? c.startAt;
    return deadline < now;
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}
