import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// We can't easily test the middleware that depends on pool/jwt without a full integration test,
// but we can test the role-checking logic and helper functions directly.

describe('RBAC - requireRole', () => {
  // We'll import the function dynamically after mocking
  let requireRole: typeof import('../auth/rbac').requireRole;

  beforeEach(async () => {
    // Mock config and db modules before importing rbac
    vi.resetModules();

    vi.doMock('../config', () => ({
      config: {
        jwtSecret: 'test-secret',
        analystUser: '',
        analystPassword: '',
      },
    }));

    vi.doMock('../db', () => ({
      pool: {
        query: vi.fn(),
      },
    }));

    vi.doMock('jsonwebtoken', () => ({
      default: {
        verify: vi.fn(),
        sign: vi.fn().mockReturnValue('mock-token'),
      },
    }));

    const rbac = await import('../auth/rbac');
    requireRole = rbac.requireRole;
  });

  function mockReqResNext(role: string | null) {
    const req = {
      user: role ? { sub: 'user-id', email: 'test@test.com', role, orgId: 'org-id' } : undefined,
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    return { req, res, next };
  }

  it('should call next() when user has an allowed role', () => {
    const middleware = requireRole('org_admin', 'platform_admin');
    const { req, res, next } = mockReqResNext('org_admin');

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 403 when user role is not in the allowed list', () => {
    const middleware = requireRole('platform_admin');
    const { req, res, next } = mockReqResNext('analyst');

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FORBIDDEN' })
    );
  });

  it('should return 403 when user is not authenticated', () => {
    const middleware = requireRole('analyst');
    const { req, res, next } = mockReqResNext(null);

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should accept platform_admin for admin-only routes', () => {
    const middleware = requireRole('platform_admin');
    const { req, res, next } = mockReqResNext('platform_admin');

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('RBAC - sendError', () => {
  it('should send proper error response', async () => {
    vi.resetModules();

    vi.doMock('../config', () => ({
      config: {
        jwtSecret: 'test-secret',
        analystUser: '',
        analystPassword: '',
      },
    }));

    vi.doMock('../db', () => ({
      pool: {
        query: vi.fn(),
      },
    }));

    vi.doMock('jsonwebtoken', () => ({
      default: {
        verify: vi.fn(),
        sign: vi.fn().mockReturnValue('mock-token'),
      },
    }));

    const rbac = await import('../auth/rbac');

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    rbac.sendError(res, 404, 'Not found', 'NOT_FOUND');

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found', code: 'NOT_FOUND' });
  });
});



