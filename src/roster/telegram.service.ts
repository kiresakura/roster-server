import { Injectable, Logger } from '@nestjs/common';

import { RosterConfig } from '../config/roster-config';

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly config: RosterConfig) {}

  isEnabled(): boolean {
    return this.config.telegram.enabled && !!this.config.telegram.botToken;
  }

  expectedWebhookSecret(): string | null {
    return this.config.telegram.webhookSecret || null;
  }

  /// Send a chat message. Buttons render as a single row of inline keyboard.
  async sendMessage(
    chatId: string | number,
    text: string,
    buttons?: TelegramInlineButton[]
  ): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.warn('Telegram is disabled or token missing; skip sendMessage.');
      return;
    }
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (buttons?.length) {
      body.reply_markup = { inline_keyboard: [buttons] };
    }
    await this.callApi('sendMessage', body);
  }

  /// Answer a callback_query so Telegram stops spinning. Required after a
  /// button press; you may show a short toast (notification text).
  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    if (!this.isEnabled()) return;
    await this.callApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text ?? '',
      show_alert: false,
    });
  }

  /// Edit a previously sent message — used to drop the inline keyboard once
  /// the task is acknowledged.
  async editMessageReplyMarkup(
    chatId: string | number,
    messageId: number,
    buttons?: TelegramInlineButton[]
  ): Promise<void> {
    if (!this.isEnabled()) return;
    await this.callApi('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: buttons?.length ? { inline_keyboard: [buttons] } : { inline_keyboard: [] },
    });
  }

  private async callApi(method: string, body: Record<string, unknown>): Promise<void> {
    const token = this.config.telegram.botToken;
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Telegram ${method} failed: ${res.status} ${text}`);
    }
  }
}
