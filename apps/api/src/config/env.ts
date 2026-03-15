// ============================================================================
// FILE: apps/api/src/config/env.ts
// Typed environment configuration — validated at startup.
// ============================================================================

import { z } from 'zod';

const EnvSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  JWT_SECRET: z.string().min(1),

  // Azure OpenAI
  AZURE_OPENAI_ENDPOINT: z.string().url(),
  AZURE_OPENAI_API_KEY: z.string().min(1),
  AZURE_OPENAI_GPT_DEPLOYMENT: z.string().default('gpt-4o'),
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: z.string().default('text-embedding-3-large'),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-06-01'),

  // Azure AI Search
  AZURE_SEARCH_ENDPOINT: z.string().url(),
  AZURE_SEARCH_API_KEY: z.string().min(1),
  AZURE_SEARCH_INDEX_NAME: z.string().default('regulatory-documents'),

  // PostgreSQL
  DATABASE_URL: z.string().min(1),

  // Neo4j
  NEO4J_URI: z.string().min(1),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // Azure Service Bus
  SERVICE_BUS_CONNECTION_STRING: z.string().default(''),

  // Azure Communication Services
  ACS_CONNECTION_STRING: z.string().default(''),
  ACS_SENDER_EMAIL: z.string().default(''),

  // Application Insights
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().default(''),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}
