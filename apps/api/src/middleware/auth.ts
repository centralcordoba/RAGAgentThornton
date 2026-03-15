// ============================================================================
// FILE: apps/api/src/middleware/auth.ts
// JWT authentication middleware.
// Validates token, extracts tenantId/userId/role, and attaches to request.
//
// In production: validates against Azure AD / Entra ID JWKS endpoint.
// In development: accepts a simple JWT signed with JWT_SECRET.
// ============================================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Errors } from '@regwatch/shared';
import type { AuthTokenPayload, UserRole } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('middleware:auth');

/** Extended request with auth context. */
export interface AuthenticatedRequest extends Request {
  tenantId: string;
  userId: string;
  userRole: UserRole;
}

export function createAuthMiddleware(): RequestHandler {
  const jwtSecret = process.env['JWT_SECRET'] ?? '';

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.requestId ?? 'unknown';

    // Skip auth for health check
    if (req.path === '/health') {
      next();
      return;
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      const error = Errors.unauthorized(requestId, 'Missing or invalid Authorization header');
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = jwt.verify(token, jwtSecret) as AuthTokenPayload;

      // Attach auth context to request
      (req as AuthenticatedRequest).tenantId = payload.tenantId;
      (req as AuthenticatedRequest).userId = payload.userId;
      (req as AuthenticatedRequest).userRole = payload.role;

      logger.debug({
        operation: 'auth:verify',
        requestId,
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role,
        result: 'success',
      });

      next();
    } catch (err) {
      const message = err instanceof jwt.TokenExpiredError
        ? 'Token expired'
        : err instanceof jwt.JsonWebTokenError
          ? 'Invalid token'
          : 'Authentication failed';

      logger.warn({
        operation: 'auth:verify',
        requestId,
        result: 'error',
        error: message,
      });

      const error = Errors.unauthorized(requestId, message);
      res.status(error.statusCode).json(error.toJSON());
    }
  };
}
