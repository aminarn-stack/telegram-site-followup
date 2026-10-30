import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(8),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(3600),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_IMPORT_BYTES: z.coerce.number().int().positive().default(5_242_880),
  MAX_EVIDENCE_BYTES: z.coerce.number().int().positive().default(10_485_760),
  APP_TIMEZONE: z.string().default('Asia/Tehran'),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(environment);
}
