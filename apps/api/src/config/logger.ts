// ============================================================================
// FILE: apps/api/src/config/logger.ts
// Centralized pino logger with redaction of sensitive fields.
// ============================================================================

import pino from 'pino';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'apiKey',
      '*.apiKey',
      '*.password',
      '*.token',
      '*.secret',
      '*.email',
      '*.connectionString',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = pino.Logger;

export function createServiceLogger(service: string): pino.Logger {
  return logger.child({ service });
}
