import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { pool } from '../db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = 'platform_admin' | 'org_admin' | 'analyst';

export type ErrorCode =
  | 'INVALID_QUERY'
  | 'SCHEMA_MISMATCH'
  | 'DB_ERROR'
  | 'TIMEOUT'
  | 'COMMITMENT_FAILED'
  | 'QUORUM_NOT_MET'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR';

export interface JwtClaims {
  sub: string;       // userId (UUID)
  email: string;
  role: UserRole;
  orgId: string | null;
}

export interface AuthenticatedRequest extends express.Request {
  user?: JwtClaims;
  org?: {
    id: string;
    name: string;
  };
}

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

export function sendError(
  res: express.Response,
  status: number,
  error: string,
  code: ErrorCode
): void {
  res.status(status).json({ error, code });
}

export const asyncHandler =
  (
    handler: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => Promise<void>
  ) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

// ---------------------------------------------------------------------------
// JWT Middleware
// ---------------------------------------------------------------------------

export function requireJwt(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  let token = '';

  const authHeader = req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    sendError(res, 401, 'Authentication required', 'UNAUTHORIZED');
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtClaims;
    if (!decoded?.sub || !decoded?.role) {
      sendError(res, 401, 'Invalid token', 'UNAUTHORIZED');
      return;
    }

    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch {
    sendError(res, 401, 'Invalid or expired token', 'UNAUTHORIZED');
  }
}

// ---------------------------------------------------------------------------
// Role-Based Access Control
// ---------------------------------------------------------------------------

export function requireRole(...roles: UserRole[]) {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role)) {
      sendError(res, 403, 'Insufficient permissions', 'FORBIDDEN');
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Org Scoping — ensures users can only access their own org's data
// ---------------------------------------------------------------------------

export function requireOrgScope(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    sendError(res, 401, 'Authentication required', 'UNAUTHORIZED');
    return;
  }

  // Platform admins bypass org scoping
  if (user.role === 'platform_admin') {
    next();
    return;
  }

  if (!user.orgId) {
    sendError(res, 403, 'No organization associated with your account', 'FORBIDDEN');
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Org API Key Middleware (for org-node → coordinator calls)
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export const requireOrgApiKey = asyncHandler(async (req, res, next) => {
  const apiKey = req.header('x-org-api-key');
  if (!apiKey) {
    sendError(res, 401, 'Invalid API key', 'UNAUTHORIZED');
    return;
  }

  const keyHash = hashApiKey(apiKey);
  const orgResult = await pool.query(
    `SELECT id, name
     FROM organizations
     WHERE api_key_hash = $1 AND status = 'active'
     LIMIT 1`,
    [keyHash]
  );

  if (orgResult.rowCount !== 1) {
    sendError(res, 401, 'Invalid API key', 'UNAUTHORIZED');
    return;
  }

  const org = orgResult.rows[0] as { id: string; name: string };
  (req as AuthenticatedRequest).org = org;
  next();
});

// ---------------------------------------------------------------------------
// JWT Token Generation
// ---------------------------------------------------------------------------

export function generateToken(claims: JwtClaims): string {
  return jwt.sign(
    { sub: claims.sub, email: claims.email, role: claims.role, orgId: claims.orgId },
    config.jwtSecret,
    { expiresIn: '8h' }
  );
}
