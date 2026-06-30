import { timingSafeEqual } from 'node:crypto';

import { Controller, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { RosterConfig } from '../config/roster-config';
import { AssignmentRepository } from './assignment.repository';
import { TaskService } from './task.service';
import { TelegramService, TelegramUpdate } from './telegram.service';
import { UserPrefRepository } from './user-pref.repository';

const BIND_PREFIX_PLAIN = '/bind ';
const BIND_PREFIX_DEEP_LINK = '/start bind_';
const CALLBACK_COMPLETE_PREFIX = 'roster:complete:';

@Controller('/api/telegram')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly taskService: TaskService,
    private readonly userPrefs: UserPrefRepository,
    private readonly assignments: AssignmentRepository,
    private readonly config: RosterConfig
  ) {}

  @Post('/webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() req: Request) {
    if (!this.verifyHeader(req)) {
      return { ok: false };
    }
    const update = req.body as TelegramUpdate | undefined;
    if (!update) return { ok: true };

    try {
      if (update.message?.text) {
        await this.handleMessage(update);
      } else if (update.callback_query) {
        await this.handleCallback(update);
      }
    } catch (e) {
      this.logger.error('Telegram webhook handler failed', e);
    }
    return { ok: true };
  }

  /// Verify Telegram's `X-Telegram-Bot-Api-Secret-Token`. Fail-closed: if no
  /// secret is configured we reject in production (a missing secret would
  /// otherwise leave the endpoint open to forged updates) and only allow it in
  /// non-production for local testing. The compare is constant-time.
  private verifyHeader(req: Request): boolean {
    const expected = this.telegram.expectedWebhookSecret();
    if (!expected) {
      if (this.config.isProduction) {
        this.logger.error(
          'Webhook secret not configured; rejecting. Set TELEGRAM_WEBHOOK_SECRET.'
        );
        return false;
      }
      this.logger.warn('Webhook secret not configured; accepting (non-production only).');
      return true;
    }
    const got = req.header('x-telegram-bot-api-secret-token') ?? '';
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Telegram webhook rejected: secret mismatch');
      return false;
    }
    return true;
  }

  private async handleMessage(update: TelegramUpdate): Promise<void> {
    const msg = update.message!;
    const chatId = msg.chat.id;
    const text = msg.text?.trim() ?? '';

    const token = this.extractBindToken(text);
    if (token) {
      await this.processBind(chatId, token);
      return;
    }
    if (text === '/start') {
      await this.telegram.sendMessage(
        chatId,
        '👋 Welcome to Roster. To finish binding, run <code>/bind &lt;token&gt;</code> with the token shown on your Roster account page.'
      );
    }
  }

  private async handleCallback(update: TelegramUpdate): Promise<void> {
    const cb = update.callback_query!;
    const data = cb.data ?? '';
    const chatId = cb.message?.chat.id;

    if (!data.startsWith(CALLBACK_COMPLETE_PREFIX)) {
      await this.telegram.answerCallbackQuery(cb.id);
      return;
    }
    const assignmentId = data.slice(CALLBACK_COMPLETE_PREFIX.length);
    if (!chatId) {
      await this.telegram.answerCallbackQuery(cb.id, 'Cannot resolve chat.');
      return;
    }

    const pref = await this.userPrefs.findByTelegramChatId(String(chatId));
    if (!pref) {
      await this.telegram.answerCallbackQuery(cb.id, 'Not bound. Run /bind first.');
      return;
    }

    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment || assignment.userId !== pref.userId) {
      await this.telegram.answerCallbackQuery(cb.id, 'Assignment not found or not yours.');
      return;
    }

    try {
      await this.taskService.completeAssignment(assignment.taskId, pref.userId);
      await this.telegram.answerCallbackQuery(cb.id, 'Marked complete ✅');
      if (cb.message) {
        // Drop the inline keyboard so the user can't double-click.
        await this.telegram.editMessageReplyMarkup(chatId, (cb.message as any).message_id);
      }
    } catch (e) {
      this.logger.warn(`Complete assignment failed: ${(e as Error).message}`);
      await this.telegram.answerCallbackQuery(cb.id, 'Could not complete (already done?)');
    }
  }

  private extractBindToken(text: string): string | null {
    if (text.startsWith(BIND_PREFIX_PLAIN)) {
      return text.slice(BIND_PREFIX_PLAIN.length).trim() || null;
    }
    if (text.startsWith(BIND_PREFIX_DEEP_LINK)) {
      return text.slice(BIND_PREFIX_DEEP_LINK.length).trim() || null;
    }
    return null;
  }

  private async processBind(chatId: number, token: string): Promise<void> {
    const pref = await this.userPrefs.findByBindToken(token);
    if (!pref) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Invalid or expired bind token. Generate a new one on your Roster account page.'
      );
      return;
    }
    await this.userPrefs.bindChat(pref.userId, String(chatId));
    await this.telegram.sendMessage(
      chatId,
      '✅ Bound. You will start receiving Roster reminders here.'
    );
  }
}
