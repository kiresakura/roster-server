import { describe, expect, it } from 'vitest';

import { createValidationPipe } from '../src/common/validation-pipe';
import { CompletionMode, RecurrenceKind, TaskType } from '../src/domain/enums';
import { CreateTaskInput, UpdateTaskInput } from '../src/roster/gql-types';

// GraphQL args are not the 'custom' param type, so they go through the same
// validation path as a REST body.
const asInput = (metatype: new () => unknown) => ({ type: 'body' as const, metatype, data: 'input' });

describe('global ValidationPipe', () => {
  it('keeps every field of a GraphQL input on createTask', async () => {
    const input = {
      title: 'Ship the release',
      type: TaskType.TASK,
      completionMode: CompletionMode.ANY,
      importance: true,
      startAt: new Date('2026-12-01T09:30:00Z'),
      recurrence: { kind: RecurrenceKind.WEEKLY, byWeekday: [1, 2, 3, 4, 5] },
      assigneeIds: ['u1'],
    };

    const out = await createValidationPipe().transform(input, asInput(CreateTaskInput));

    expect(out).toMatchObject(input);
  });

  it('keeps the fields of an updateTask input', async () => {
    const out = await createValidationPipe().transform({ title: 'Renamed' }, asInput(UpdateTaskInput));
    expect(out).toMatchObject({ title: 'Renamed' });
  });
});
