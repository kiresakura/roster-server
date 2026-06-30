import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { RosterConfig } from '../config/roster-config';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from './current-user.decorator';

const SCRYPT_KEYLEN = 64;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: RosterConfig
  ) {}

  /// scrypt password hash, stored as `salt:hash` (hex). No native dependency.
  static hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return `${salt}:${hash}`;
  }

  static verifyPassword(password: string, stored: string | null | undefined): boolean {
    if (!stored) return false;
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async login(email: string, password: string): Promise<{ accessToken: string; user: CurrentUser }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !AuthService.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const principal: CurrentUser = { id: user.id, email: user.email, name: user.name };
    return { accessToken: this.issueToken(principal), user: principal };
  }

  issueToken(user: CurrentUser): string {
    return jwt.sign({ email: user.email, name: user.name }, this.config.jwtSecret, {
      subject: user.id,
      expiresIn: '7d',
    });
  }

  verifyToken(token: string): CurrentUser | null {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as jwt.JwtPayload;
      if (!payload.sub) return null;
      return { id: payload.sub, email: payload.email, name: payload.name };
    } catch {
      return null;
    }
  }
}
