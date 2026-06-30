import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Prisma, UserPref } from '@prisma/client';

import { BaseRepository } from '../prisma/base.repository';

export type { UserPref };

@Injectable()
export class UserPrefRepository extends BaseRepository {
  constructor(txHost: TransactionHost<TransactionalAdapterPrisma>) {
    super(txHost);
  }

  findByUserId(userId: string) {
    return this.db.userPref.findUnique({ where: { userId } });
  }

  findByTelegramChatId(chatId: string) {
    return this.db.userPref.findUnique({ where: { telegramChatId: chatId } });
  }

  findByBindToken(token: string) {
    return this.db.userPref.findUnique({ where: { telegramBindToken: token } });
  }

  upsert(userId: string, patch: Prisma.UserPrefUncheckedUpdateInput) {
    return this.db.userPref.upsert({
      where: { userId },
      create: { ...(patch as Prisma.UserPrefUncheckedCreateInput), userId },
      update: patch,
    });
  }

  /// Generate a fresh one-shot bind token for the user. Stored unhashed for a
  /// short window — Telegram is the only thing that should ever see it. Used
  /// via deep-link `/start bind_<token>` or `/bind <token>`.
  async issueBindToken(userId: string): Promise<string> {
    const token = randomBytes(18).toString('base64url');
    await this.upsert(userId, { telegramBindToken: token, telegramChatId: null });
    return token;
  }

  /// Atomically consume the token: clear it and set the chat id.
  bindChat(userId: string, chatId: string) {
    return this.db.userPref.update({
      where: { userId },
      data: { telegramChatId: chatId, telegramBindToken: null },
    });
  }

  unbindChat(userId: string) {
    return this.db.userPref.update({
      where: { userId },
      data: { telegramChatId: null, telegramBindToken: null },
    });
  }

  listSupervisors() {
    return this.db.userPref.findMany({ where: { isSupervisor: true } });
  }

  listBound() {
    return this.db.userPref.findMany({
      where: { telegramChatId: { not: null } },
      select: {
        userId: true,
        telegramChatId: true,
        reminderLeadMinutes: true,
        isSupervisor: true,
      },
    });
  }
}
