import { existsSync } from 'node:fs';

/// 若 `path` 存在就把它載入 `process.env`（Node 內建 `process.loadEnvFile`）。
/// 已存在的環境變數優先、不會被覆寫；檔案不存在時什麼都不做，正式環境照常
/// 只吃注入的環境變數。回傳是否有載入檔案。
export function loadEnvFileIfPresent(path = '.env'): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
