import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticationRequired } from '../common/exceptions';
import { RosterConfig } from '../config/roster-config';
import { LeaveService } from './leave.service';
import { TaskService } from './task.service';
import { UserPrefRepository } from './user-pref.repository';
import {
  ApplyLeaveInput,
  CreateTaskInput,
  HealthObject,
  LeaveRequestObject,
  ListTasksFilterInput,
  TaskObject,
  TelegramBindObject,
  UpdateTaskInput,
  UserPrefObject,
} from './gql-types';

@Resolver(() => TaskObject)
export class RosterResolver {
  constructor(
    private readonly taskService: TaskService,
    private readonly leave: LeaveService,
    private readonly userPrefs: UserPrefRepository,
    private readonly config: RosterConfig
  ) {}

  @Query(() => HealthObject, { description: 'Service health probe.' })
  health(): HealthObject {
    return { ok: true, enabled: this.taskService.isEnabled() };
  }

  @Query(() => [TaskObject], {
    description: 'List tasks. Filter by type, status, time range, or assignee.',
  })
  async tasks(
    @CurrentUser() user: CurrentUser | null,
    @Args('filter', { type: () => ListTasksFilterInput, nullable: true })
    filter?: ListTasksFilterInput | null
  ): Promise<TaskObject[]> {
    if (!user) throw new AuthenticationRequired();
    return (await this.taskService.listTasks(filter ?? {})) as unknown as TaskObject[];
  }

  @Mutation(() => TaskObject, { description: 'Create a new task or reminder.' })
  async createTask(
    @CurrentUser() user: CurrentUser | null,
    @Args('input') input: CreateTaskInput
  ): Promise<TaskObject> {
    if (!user) throw new AuthenticationRequired();
    return (await this.taskService.createTask(user.id, input)) as unknown as TaskObject;
  }

  @Mutation(() => TaskObject, { description: 'Update an existing task.' })
  async updateTask(
    @CurrentUser() user: CurrentUser | null,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateTaskInput
  ): Promise<TaskObject> {
    if (!user) throw new AuthenticationRequired();
    return (await this.taskService.updateTask(id, input)) as unknown as TaskObject;
  }

  @Mutation(() => Boolean, { description: 'Delete a task.' })
  async deleteTask(
    @CurrentUser() user: CurrentUser | null,
    @Args('id', { type: () => ID }) id: string
  ): Promise<boolean> {
    if (!user) throw new AuthenticationRequired();
    await this.taskService.deleteTask(id);
    return true;
  }

  @Mutation(() => TaskObject, {
    description: 'Mark the current user assignment for this task as complete.',
  })
  async completeAssignment(
    @CurrentUser() user: CurrentUser | null,
    @Args('taskId', { type: () => ID }) taskId: string
  ): Promise<TaskObject> {
    if (!user) throw new AuthenticationRequired();
    return (await this.taskService.completeAssignment(
      taskId,
      user.id
    )) as unknown as TaskObject;
  }

  @Query(() => UserPrefObject, {
    description: "Current user's preferences (Telegram binding state, reminder lead).",
  })
  async myPreferences(@CurrentUser() user: CurrentUser | null): Promise<UserPrefObject> {
    if (!user) throw new AuthenticationRequired();
    const pref = await this.userPrefs.findByUserId(user.id);
    return {
      userId: user.id,
      isSupervisor: pref?.isSupervisor ?? false,
      hasTelegramChat: !!pref?.telegramChatId,
      reminderLeadMinutes: pref?.reminderLeadMinutes ?? 30,
    };
  }

  @Mutation(() => TelegramBindObject, {
    description: 'Issue a one-shot Telegram bind token + deep link for the current user.',
  })
  async startTelegramBind(
    @CurrentUser() user: CurrentUser | null
  ): Promise<TelegramBindObject> {
    if (!user) throw new AuthenticationRequired();
    const token = await this.userPrefs.issueBindToken(user.id);
    const botUsername = this.config.telegram.botUsername;
    const deepLinkUrl = botUsername ? `https://t.me/${botUsername}?start=bind_${token}` : '';
    return { token, deepLinkUrl, fallbackCommand: `/bind ${token}` };
  }

  @Mutation(() => Boolean, { description: 'Unbind the current user from Telegram.' })
  async unbindTelegram(@CurrentUser() user: CurrentUser | null): Promise<boolean> {
    if (!user) throw new AuthenticationRequired();
    await this.userPrefs.unbindChat(user.id);
    return true;
  }

  @Query(() => [LeaveRequestObject], { description: 'Current user own leave requests history.' })
  async myLeaveRequests(
    @CurrentUser() user: CurrentUser | null
  ): Promise<LeaveRequestObject[]> {
    if (!user) throw new AuthenticationRequired();
    return (await this.leave.listOwn(user.id)) as unknown as LeaveRequestObject[];
  }

  @Query(() => [LeaveRequestObject], {
    description: 'Pending leave requests awaiting supervisor review.',
  })
  async pendingLeaveRequests(
    @CurrentUser() user: CurrentUser | null
  ): Promise<LeaveRequestObject[]> {
    if (!user) throw new AuthenticationRequired();
    return (await this.leave.listPendingForSupervisor(user.id)) as unknown as LeaveRequestObject[];
  }

  @Mutation(() => LeaveRequestObject, { description: 'Apply for leave for the current user.' })
  async applyLeave(
    @CurrentUser() user: CurrentUser | null,
    @Args('input') input: ApplyLeaveInput
  ): Promise<LeaveRequestObject> {
    if (!user) throw new AuthenticationRequired();
    return (await this.leave.apply(
      user.id,
      input.startAt,
      input.endAt,
      input.reason
    )) as unknown as LeaveRequestObject;
  }

  @Mutation(() => LeaveRequestObject, {
    description: 'Approve a pending leave request. Supervisor only.',
  })
  async approveLeave(
    @CurrentUser() user: CurrentUser | null,
    @Args('id', { type: () => ID }) id: string
  ): Promise<LeaveRequestObject> {
    if (!user) throw new AuthenticationRequired();
    return (await this.leave.approve(id, user.id)) as unknown as LeaveRequestObject;
  }

  @Mutation(() => LeaveRequestObject, {
    description: 'Reject a pending leave request. Supervisor only.',
  })
  async rejectLeave(
    @CurrentUser() user: CurrentUser | null,
    @Args('id', { type: () => ID }) id: string
  ): Promise<LeaveRequestObject> {
    if (!user) throw new AuthenticationRequired();
    return (await this.leave.reject(id, user.id)) as unknown as LeaveRequestObject;
  }

  @Mutation(() => LeaveRequestObject, { description: 'Cancel an own leave request.' })
  async cancelLeave(
    @CurrentUser() user: CurrentUser | null,
    @Args('id', { type: () => ID }) id: string
  ): Promise<LeaveRequestObject> {
    if (!user) throw new AuthenticationRequired();
    return (await this.leave.cancel(id, user.id)) as unknown as LeaveRequestObject;
  }

  @Mutation(() => UserPrefObject, {
    description: 'Update the current user reminder lead time (minutes before due).',
  })
  async updateReminderLeadMinutes(
    @CurrentUser() user: CurrentUser | null,
    @Args('minutes', { type: () => Int }) minutes: number
  ): Promise<UserPrefObject> {
    if (!user) throw new AuthenticationRequired();
    if (minutes < 0 || minutes > 24 * 60) {
      throw new Error('minutes must be between 0 and 1440');
    }
    const pref = await this.userPrefs.upsert(user.id, { reminderLeadMinutes: minutes });
    return {
      userId: user.id,
      isSupervisor: pref.isSupervisor,
      hasTelegramChat: !!pref.telegramChatId,
      reminderLeadMinutes: pref.reminderLeadMinutes,
    };
  }
}
