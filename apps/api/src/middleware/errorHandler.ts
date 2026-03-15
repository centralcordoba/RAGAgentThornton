// ============================================================================
// FILE: apps/api/src/middleware/errorHandler.ts
// Centralized error handler — transforms all errors into structured responses.
// Format: { code, message, requestId, details? }
// ============================================================================

import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('middleware:error-handler');

export function createErrorHandler(): ErrorRequestHandler {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.requestId ?? 'unknown';

    if (err instanceof AppError) {
      // Known application error — log at appropriate level
      if (err.statusCode >= 500) {
        logger.error({
          operation: 'error_handler:app_error',
          requestId,
          code: err.code,
          message: err.message,
          statusCode: err.statusCode,
          path: req.path,
          method: req.method,
          result: 'error',
          ...(err.cause ? { cause: (err.cause as Error).message } : {}),
        });
      } else {
        logger.warn({
          operation: 'error_handler:app_error',
          requestId,
          code: err.code,
          message: err.message,
          statusCode: err.statusCode,
          path: req.path,
          method: req.method,
          result: 'client_error',
        });
      }

      res.status(err.statusCode).json(err.toJSON());
      return;
    }

    if (err instanceof SyntaxError && 'body' in err) {
      // JSON parse error
      logger.warn({
        operation: 'error_handler:json_parse',
        requestId,
        path: req.path,
        method: req.method,
        result: 'client_error',
      });

      res.status(400).json({
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
        requestId,
      });
      return;
    }

    // Unexpected error — log full details, return generic message
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    logger.error({
      operation: 'error_handler:unexpected',
      requestId,
      path: req.path,
      method: req.method,
      error: errorMessage,
      stack: errorStack,
      result: 'error',
    });

    // Never leak internal error details to the client
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    });
  };
}
