// ============================================================================
// FILE: apps/api/src/middleware/rbac.ts
// Role-Based Access Control middleware.
//
// Roles:
//   ADMIN         — full access, manage users, system config
//   PROFESSIONAL  — GT staff, approve HITL alerts, manage clients
//   CLIENT_VIEWER — read-only client dashboard, acknowledge own alerts
// ============================================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { Errors } from '@regwatch/shared';
import type { UserRole } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';
import type { AuthenticatedRequest } from './auth.js';

const logger = createServiceLogger('middleware:rbac');

/**
 * Create an RBAC middleware that restricts access to the given roles.
 */
export function createRbacMiddleware(allowedRoles: readonly UserRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.requestId ?? 'unknown';
    const userRole = (req as AuthenticatedRequest).userRole;

    if (!userRole) {
      const error = Errors.unauthorized(requestId, 'No role found in token');
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    if (!allowedRoles.includes(userRole)) {
      logger.warn({
        operation: 'rbac:check',
        requestId,
        userId: (req as AuthenticatedRequest).userId,
        userRole,
        allowedRoles,
        path: req.path,
        method: req.method,
        result: 'forbidden',
      });

      const error = Errors.forbidden(
        requestId,
        `Role '${userRole}' does not have access to this resource`,
      );
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    next();
  };
}

/**
 * Route-level permission matrix.
 * Used to define fine-grained permissions per endpoint + method.
 */
export const ROUTE_PERMISSIONS: Readonly<Record<string, Readonly<Record<string, readonly UserRole[]>>>> = {
  '/api/ingest/trigger': {
    POST: ['ADMIN', 'PROFESSIONAL'],
  },
  '/api/clients': {
    GET: ['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER'],
    POST: ['ADMIN', 'PROFESSIONAL'],
  },
  '/api/regulations': {
    GET: ['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER'],
  },
  '/api/chat': {
    POST: ['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER'],
  },
  '/api/alerts': {
    GET: ['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER'],
  },
  '/api/alerts/:id/ack': {
    POST: ['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER'],
    // Note: HITL approval logic (PROFESSIONAL required for PENDING_REVIEW)
    // is enforced in the route handler, not here
  },
} as const;
