import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

/// The authenticated principal attached to the request by `AuthMiddleware`.
/// (Declaration-merged with the decorator below so `@CurrentUser() u: CurrentUser`
/// reads naturally, matching the original host-platform ergonomics.)
export interface CurrentUser {
  id: string;
  email: string;
  name?: string | null;
}

function requestOf(ctx: ExecutionContext): any {
  if (ctx.getType<'graphql'>() === 'graphql') {
    return GqlExecutionContext.create(ctx).getContext().req;
  }
  return ctx.switchToHttp().getRequest();
}

/// Injects the current user, or `null` when unauthenticated. Resolvers decide
/// whether `null` is acceptable (most throw `AuthenticationRequired`).
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUser | null => {
    return requestOf(ctx)?.user ?? null;
  }
);
