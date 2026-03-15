// ============================================================================
// FILE: packages/shared/src/result.test.ts
// Tests for the Result<T, E> pattern.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ok, fail } from './result.js';
import type { Result, AppErrorData } from './result.js';

describe('Result pattern', () => {
  it('ok() creates a successful result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('fail() creates a failure result', () => {
    const error: AppErrorData = {
      code: 'NOT_FOUND',
      message: 'Not found',
      requestId: 'req-1',
    };
    const result = fail(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('works with type narrowing', () => {
    function divide(a: number, b: number): Result<number> {
      if (b === 0) {
        return fail({ code: 'DIV_ZERO', message: 'Division by zero', requestId: 'test' });
      }
      return ok(a / b);
    }

    const success = divide(10, 2);
    expect(success.ok).toBe(true);
    if (success.ok) expect(success.value).toBe(5);

    const failure = divide(10, 0);
    expect(failure.ok).toBe(false);
    if (!failure.ok) expect(failure.error.code).toBe('DIV_ZERO');
  });
});
