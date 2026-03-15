/**
 * Result<T, E> pattern for operations that can fail.
 * Avoids throwing exceptions for expected failure cases.
 */

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = AppErrorData> = Success<T> | Failure<E>;

export interface AppErrorData {
  readonly code: string;
  readonly message: string;
  readonly requestId: string;
  readonly details?: unknown;
}

export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function fail<E>(error: E): Failure<E> {
  return { ok: false, error };
}
