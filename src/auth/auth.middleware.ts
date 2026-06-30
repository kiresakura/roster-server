import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { AuthService } from './auth.service';

/// Populates `req.user` from a `Bearer <jwt>` Authorization header. Never
/// blocks — unauthenticated requests simply carry no user, and each resolver
/// decides whether that is allowed.
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const user = this.auth.verifyToken(header.slice(7).trim());
      if (user) (req as any).user = user;
    }
    next();
  }
}
