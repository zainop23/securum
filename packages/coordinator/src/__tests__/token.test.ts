import { describe, it, expect, vi } from 'vitest';

describe('generateToken', () => {
  it('should generate a valid JWT token string', async () => {
    vi.resetModules();

    vi.doMock('../config', () => ({
      config: {
        jwtSecret: 'test-secret-key-for-jwt',
        analystUser: '',
        analystPassword: '',
      },
    }));

    vi.doMock('../db', () => ({
      pool: {
        query: vi.fn(),
      },
    }));

    // Import rbac WITHOUT mocking jsonwebtoken — we want real JWT generation
    const { generateToken } = await import('../auth/rbac');

    const token = generateToken({
      sub: 'user-123',
      email: 'test@example.com',
      role: 'analyst',
      orgId: 'org-456',
    });

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
  });

  it('should include claims in the generated token', async () => {
    vi.resetModules();

    vi.doMock('../config', () => ({
      config: {
        jwtSecret: 'test-secret-key-for-jwt',
        analystUser: '',
        analystPassword: '',
      },
    }));

    vi.doMock('../db', () => ({
      pool: {
        query: vi.fn(),
      },
    }));

    const { generateToken } = await import('../auth/rbac');
    const jwt = await import('jsonwebtoken');

    const token = generateToken({
      sub: 'user-123',
      email: 'test@example.com',
      role: 'platform_admin',
      orgId: null,
    });

    const decoded = jwt.default.verify(token, 'test-secret-key-for-jwt') as Record<string, unknown>;
    expect(decoded.sub).toBe('user-123');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('platform_admin');
    expect(decoded.orgId).toBeNull();
  });
});
