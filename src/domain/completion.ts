import { CompletionMode, TaskType } from './enums';

export interface AssignmentSnapshot {
  id: string;
  userId: string;
  status: 'NOT_STARTED' | 'COMPLETED' | 'SKIPPED_ON_LEAVE';
}

export interface TaskSnapshot {
  id: string;
  type: TaskType;
  completionMode: CompletionMode | null;
  assignments: AssignmentSnapshot[];
}

export interface CompletionEffects {
  /// The assignment status to write for the completer.
  assignmentNewStatus: 'COMPLETED';
  /// Whether the task itself should flip to COMPLETED after this action.
  taskCompleted: boolean;
  /// User ids that should be notified that the task was completed by someone else.
  notifyUserIds: string[];
}

/// Pure decision function for what to do when `completerUserId` marks their
/// assignment complete. Throws for REMINDER tasks (no completion lifecycle)
/// and for users not assigned to the task.
export function decideCompletionEffects(
  task: TaskSnapshot,
  completerUserId: string
): CompletionEffects {
  if (task.type === TaskType.REMINDER) {
    throw new Error('REMINDER tasks have no completion lifecycle.');
  }
  const own = task.assignments.find(a => a.userId === completerUserId);
  if (!own) {
    throw new Error('User is not assigned to this task.');
  }

  // Project the assignment state *after* the user's action.
  const others = task.assignments.filter(a => a.userId !== completerUserId);

  if (task.completionMode === CompletionMode.ANY) {
    return {
      assignmentNewStatus: 'COMPLETED',
      taskCompleted: true,
      // Tell anyone who hasn't already finished that the work is done.
      notifyUserIds: others.filter(a => a.status === 'NOT_STARTED').map(a => a.userId),
    };
  }

  if (task.completionMode === CompletionMode.ALL) {
    const allOthersDone = others.every(
      a => a.status === 'COMPLETED' || a.status === 'SKIPPED_ON_LEAVE'
    );
    return {
      assignmentNewStatus: 'COMPLETED',
      taskCompleted: allOthersDone,
      // ALL mode → no "cancel for others", everyone still owes their part.
      notifyUserIds: [],
    };
  }

  throw new Error('TASK type must have a completionMode (ANY or ALL).');
}
