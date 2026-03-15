// ============================================================================
// FILE: apps/api/src/middleware/auditLog.ts
// Audit logger — logs all access to client data endpoints.
// Never logs sensitive data (request bodies, auth tokens, PII).
// ============================================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { createServiceLogger } from '../config/logger.js';
import type { AuthenticatedRequest } from './auth.js';

const logger = createServiceLogger('middleware:audit');

/** Paths that trigger audit logging. */
const AUDITED_PATHS = [
  '/api/clients',
  '/api/regulations',
  '/api/alerts',
  '/api/chat',
  '/api/ingest',
] as const;

export function createAuditLogMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const shouldAudit = AUDITED_PATHS.some((path) => req.path.startsWith(path));

    if (!shouldAudit) {
      next();
      return;
    }

    const startTime = Date.now();

    // Capture response status after the response is sent
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const authReq = req as AuthenticatedRequest;

      logger.info({
        operation: 'audit:access',
        requestId: req.requestId,
        userId: authReq.userId ?? 'anonymous',
        tenantId: authReq.tenantId ?? 'unknown',
        role: authReq.userRole ?? 'unknown',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        // Only log safe query params (no body, no auth)
        queryParams: sanitizeQuery(req.query),
        userAgent: req.headers['user-agent']?.slice(0, 100),
      });
    });

    next();
  };
}

/**
 * Sanitize query params for logging.
 * Remove any potentially sensitive values.
 */
function sanitizeQuery(
  query: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = new Set([
    'token', 'key', 'secret', 'password', 'apiKey', 'authorization',
  ]);

  for (const [key, value] of Object.entries(query)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
