import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';

import type { PrismaService } from './prisma.service';

/// Base class for repositories. `this.db` is a transaction-aware Prisma client:
/// inside a method (or caller) wrapped with `@Transactional()` it resolves to
/// the active transaction; otherwise to the root client. This mirrors the
/// data-access pattern of the original host platform.
@Injectable()
export class BaseRepository {
  constructor(protected readonly txHost: TransactionHost<TransactionalAdapterPrisma>) {}

  protected get db(): PrismaService {
    return this.txHost.tx as unknown as PrismaService;
  }
}
