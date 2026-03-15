// ============================================================================
// FILE: packages/shared/src/errors.test.ts
// Tests for AppError and error factory functions.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { AppError, Errors } from './errors.js';

describe('AppError', () => {
  it('should create error with all fields', () => {
    const error = new AppError({
      code: 'TEST_ERROR',
      message: 'Something went wrong',
      requestId: 'req-123',
      statusCode: 400,
      details: { field: 'name' },
    });

    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Something went wrong');
    expect(error.requestId).toBe('req-123');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: 'name' });
    expect(error.name).toBe('AppError');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  it('should default to 500 status code', () => {
    const error = new AppError({
      code: 'INTERNAL',
      message: 'fail',
      requestId: 'req-1',
    });
    expect(error.statusCode).toBe(500);
  });

  it('should serialize to JSON format', () => {
    const error = new AppError({
      code: 'TEST',
      message: 'msg',
      requestId: 'req-1',
      details: { x: 1 },
    });
    const json = error.toJSON();
    expect(json).toEqual({
      code: 'TEST',
      message: 'msg',
      requestId: 'req-1',
      details: { x: 1 },
    });
  });

  it('should preserve cause chain', () => {
    const cause = new Error('root cause');
    const error = new AppError({
      code: 'WRAPPED',
      message: 'wrapper',
      requestId: 'req-1',
      cause,
    });
    expect(error.cause).toBe(cause);
  });
});

describe('Errors factory', () => {
  it('notFound returns 404', () => {
    const err = Errors.notFound('req-1', 'Client', 'abc');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('abc');
  });

  it('unauthorized returns 401', () => {
    const err = Errors.unauthorized('req-1');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('forbidden returns 403', () => {
    const err = Errors.forbidden('req-1');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('validation returns 400 with details', () => {
    const details = [{ path: ['name'], message: 'required' }];
    const err = Errors.validation('req-1', details);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(details);
  });

  it('conflict returns 409', () => {
    const err = Errors.conflict('req-1', 'duplicate');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('rateLimited returns 429 with retryAfterMs', () => {
    const err = Errors.rateLimited('req-1', 5000);
    expect(err.statusCode).toBe(429);
    expect(err.details).toEqual({ retryAfterMs: 5000 });
  });

  it('externalService returns 502', () => {
    const cause = new Error('timeout');
    const err = Errors.externalService('req-1', 'Azure OpenAI', cause);
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(err.cause).toBe(cause);
  });

  it('internal returns 500', () => {
    const err = Errors.internal('req-1', 'unexpected');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});
