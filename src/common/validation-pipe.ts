import { ValidationPipe } from '@nestjs/common';

/// 全域 ValidationPipe，負責 REST DTO（例如登入）的 class-validator 驗證。
/// 不能開 `whitelist`：GraphQL input 類別沒有 class-validator 裝飾器，開了會把
/// 所有欄位剝光；未知欄位本來就會被 GraphQL schema 擋下。
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({ transform: true });
}
