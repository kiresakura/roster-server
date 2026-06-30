import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/// A 400 carrying a stable machine-readable `code` alongside the message.
export class BadRequest extends BadRequestException {
  constructor(opts: { code: string; message: string }) {
    super({ code: opts.code, message: opts.message });
  }
}

export class NotFound extends NotFoundException {
  constructor(message = 'Resource not found.') {
    super(message);
  }
}

export class AuthenticationRequired extends UnauthorizedException {
  constructor(message = 'Authentication required.') {
    super(message);
  }
}
