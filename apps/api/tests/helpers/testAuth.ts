// ============================================================================
// FILE: apps/api/tests/helpers/testAuth.ts
// JWT token generator for tests.
// ============================================================================

import jwt from 'jsonwebtoken';
import type { UserRole } from '@regwatch/shared';

const TEST_JWT_SECRET = 'test-secret-for-ci';

export interface TestUser {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: UserRole;
}

export const TEST_USERS = {
  admin: {
    userId: 'user-admin-001',
    tenantId: 'tenant-001',
    role: 'ADMIN' as const,
  },
  professional: {
    userId: 'user-pro-001',
    tenantId: 'tenant-001',
    role: 'PROFESSIONAL' as const,
  },
  clientViewer: {
    userId: 'user-client-001',
    tenantId: 'tenant-001',
    role: 'CLIENT_VIEWER' as const,
  },
  otherTenant: {
    userId: 'user-other-001',
    tenantId: 'tenant-002',
    role: 'ADMIN' as const,
  },
} as const;

export function generateTestToken(user: TestUser): string {
  return jwt.sign(
    {
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
    },
    TEST_JWT_SECRET,
    { expiresIn: '1h' },
  );
}

export function getAuthHeader(user: TestUser): string {
  return `Bearer ${generateTestToken(user)}`;
}

export { TEST_JWT_SECRET };
