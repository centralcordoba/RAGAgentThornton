import type { AppErrorData } from './result.js';

/**
 * Centralized application error class.
 * All errors thrown in the application MUST use this class.
 * Format: { code, message, requestId, details? }
 */
export class AppError extends Error implements AppErrorData {
  public readonly code: string;
  public readonly requestId: string;
  public readonly details?: unknown;
  public readonly statusCode: number;

  constructor(params: {
    code: string;
    message: string;
    requestId: string;
    statusCode?: number;
    details?: unknown;
    cause?: Error;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'AppError';
    this.code = params.code;
    this.requestId = params.requestId;
    this.statusCode = params.statusCode ?? 500;
    this.details = params.details;
  }

  toJSON(): AppErrorData {
    return {
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      details: this.details,
    };
  }
}

/** Common error factory functions */
export const Errors = {
  notFound(requestId: string, resource: string, id: string): AppError {
    return new AppError({
      code: 'NOT_FOUND',
      message: `${resource} with id '${id}' not found`,
      requestId,
      statusCode: 404,
    });
  },

  unauthorized(requestId: string, message = 'Unauthorized'): AppError {
    return new AppError({
      code: 'UNAUTHORIZED',
      message,
      requestId,
      statusCode: 401,
    });
  },

  forbidden(requestId: string, message = 'Forbidden'): AppError {
    return new AppError({
      code: 'FORBIDDEN',
      message,
      requestId,
      statusCode: 403,
    });
  },

  validation(requestId: string, details: unknown): AppError {
    return new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      requestId,
      statusCode: 400,
      details,
    });
  },

  conflict(requestId: string, message: string): AppError {
    return new AppError({
      code: 'CONFLICT',
      message,
      requestId,
      statusCode: 409,
    });
  },

  externalService(requestId: string, service: string, cause?: Error): AppError {
    return new AppError({
      code: 'EXTERNAL_SERVICE_ERROR',
      message: `External service '${service}' failed`,
      requestId,
      statusCode: 502,
      details: { service },
      cause,
    });
  },

  rateLimited(requestId: string, retryAfterMs?: number): AppError {
    return new AppError({
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded',
      requestId,
      statusCode: 429,
      details: retryAfterMs ? { retryAfterMs } : undefined,
    });
  },

  internal(requestId: string, message: string, cause?: Error): AppError {
    return new AppError({
      code: 'INTERNAL_ERROR',
      message,
      requestId,
      statusCode: 500,
      cause,
    });
  },
} as const;
