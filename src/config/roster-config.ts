import { z } from 'zod';

/// Parse a boolean from an env string. `z.coerce.boolean()` is unsafe here —
/// it treats the string "false" as truthy — so do it explicitly.
const boolEnv = (def: boolean) =>
  z
    .string()
    .optional()
    .transform(v => (v == null ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3010),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(1).default('dev-insecure-secret-change-me'),

  TELEGRAM_ENABLED: boolEnv(false),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_BOT_USERNAME: z.string().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),

  DAILY_REVIEW_CRON: z.string().min(1).default('0 18 * * *'),
  DAILY_REVIEW_TIMEZONE: z.string().min(1).default('UTC'),
});

export type RosterEnv = z.infer<typeof EnvSchema>;

/// Typed, validated application config. Injected as a provider; replaces the
/// host platform's `Config` service.
export class RosterConfig {
  readonly nodeEnv: RosterEnv['NODE_ENV'];
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly jwtSecret: string;
  readonly telegram: {
    enabled: boolean;
    botToken: string;
    botUsername: string;
    webhookSecret: string;
  };
  readonly dailyReview: { cron: string; timezone: string };

  private constructor(env: RosterEnv) {
    this.nodeEnv = env.NODE_ENV;
    this.port = env.PORT;
    this.databaseUrl = env.DATABASE_URL;
    this.redisUrl = env.REDIS_URL;
    this.jwtSecret = env.JWT_SECRET;
    this.telegram = {
      enabled: env.TELEGRAM_ENABLED,
      botToken: env.TELEGRAM_BOT_TOKEN,
      botUsername: env.TELEGRAM_BOT_USERNAME,
      webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    };
    this.dailyReview = {
      cron: env.DAILY_REVIEW_CRON,
      timezone: env.DAILY_REVIEW_TIMEZONE,
    };
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  static load(env: NodeJS.ProcessEnv = process.env): RosterConfig {
    const parsed = EnvSchema.safeParse(env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    return new RosterConfig(parsed.data);
  }
}
