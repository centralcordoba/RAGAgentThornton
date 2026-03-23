// ============================================================================
// FILE: apps/web/lib/api/devAuth.ts
// Development-only: auto-generates a JWT for API access.
// In production, this is replaced by Azure AD / Entra ID SSO.
// ============================================================================

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const DEV_TOKEN_KEY = 'auth_token';

/**
 * Get the auth token from sessionStorage.
 * In development, generates a dev token if none exists.
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  const existing = sessionStorage.getItem(DEV_TOKEN_KEY);
  if (existing) return existing;

  // In development: set a pre-generated dev token
  // This token is signed with the dev JWT_SECRET from .env
  const devToken = process.env['NEXT_PUBLIC_DEV_TOKEN'] ?? null;
  if (devToken) {
    sessionStorage.setItem(DEV_TOKEN_KEY, devToken);
    return devToken;
  }

  return null;
}

/**
 * Get auth headers for API requests.
 * Returns empty object if no token is available.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
