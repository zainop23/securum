import { Router } from 'express';
import { randomUUID, randomBytes } from 'crypto';
import { hashPassword, verifyPassword } from '../auth/password';
import {
  asyncHandler,
  sendError,
  generateToken,
  requireJwt,
  requireRole,
  hashApiKey,
  AuthenticatedRequest,
  JwtClaims,
} from '../auth/rbac';
import { pool } from '../db';
import { config } from '../config';

export const authRouter = Router();

// ---------------------------------------------------------------------------
// POST /auth/register — create org + org_admin user
// ---------------------------------------------------------------------------
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, fullName, orgName } = req.body as {
      email?: string;
      password?: string;
      fullName?: string;
      orgName?: string;
    };

    // ── Validation ──
    if (!email || !password || !fullName || !orgName) {
      sendError(res, 400, 'email, password, fullName, and orgName are required', 'VALIDATION_ERROR');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      sendError(res, 400, 'Invalid email format', 'VALIDATION_ERROR');
      return;
    }

    if (password.length < 8) {
      sendError(res, 400, 'Password must be at least 8 characters', 'VALIDATION_ERROR');
      return;
    }

    if (!/[A-Z]/.test(password)) {
      sendError(res, 400, 'Password must contain at least one uppercase letter', 'VALIDATION_ERROR');
      return;
    }

    if (!/[0-9]/.test(password)) {
      sendError(res, 400, 'Password must contain at least one number', 'VALIDATION_ERROR');
      return;
    }

    // ── Check email uniqueness ──
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existingUser.rowCount && existingUser.rowCount > 0) {
      sendError(res, 409, 'Email already registered', 'VALIDATION_ERROR');
      return;
    }

    // ── Transaction: create org + user ──
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orgId = randomUUID();
      const apiKey = randomBytes(32).toString('hex');
      const apiKeyHash = hashApiKey(apiKey);

      await client.query(
        `INSERT INTO organizations (id, name, api_key_hash, endpoint_url, status, onboarding_step)
         VALUES ($1, $2, $3, '', 'pending', 'account_created')`,
        [orgId, orgName, apiKeyHash]
      );

      const userId = randomUUID();
      const passwordHash = await hashPassword(password);

      await client.query(
        `INSERT INTO users (id, email, password_hash, full_name, role, org_id, is_active)
         VALUES ($1, $2, $3, $4, 'org_admin', $5, true)`,
        [userId, email.toLowerCase(), passwordHash, fullName, orgId]
      );

      await client.query('COMMIT');

      // ── Generate JWT ──
      const claims: JwtClaims = {
        sub: userId,
        email: email.toLowerCase(),
        role: 'org_admin',
        orgId,
      };
      const token = generateToken(claims);

      res.status(201).json({
        token,
        apiKey,
        user: {
          id: userId,
          email: email.toLowerCase(),
          fullName,
          role: 'org_admin',
          orgId,
          orgName,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      const message = (err as Error).message ?? '';
      if (message.includes('unique') || message.includes('duplicate')) {
        sendError(res, 409, 'Organization name already taken', 'VALIDATION_ERROR');
      } else {
        throw err;
      }
    } finally {
      client.release();
    }
  })
);

// ---------------------------------------------------------------------------
// POST /auth/login — email + password (with legacy fallback)
// ---------------------------------------------------------------------------
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password, username } = req.body as {
      email?: string;
      password?: string;
      username?: string;
    };

    // Support both `email` and `username` field names for backward compat
    const loginEmail = email || username;

    if (!loginEmail || !password) {
      sendError(res, 400, 'email and password are required', 'VALIDATION_ERROR');
      return;
    }

    // ── Try DB user lookup first ──
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.org_id, u.is_active,
              o.name AS org_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.org_id
       WHERE u.email = $1`,
      [loginEmail.toLowerCase()]
    );

    if (userResult.rowCount && userResult.rowCount > 0) {
      const user = userResult.rows[0] as {
        id: string;
        email: string;
        password_hash: string;
        full_name: string;
        role: string;
        org_id: string | null;
        is_active: boolean;
        org_name: string | null;
      };

      if (!user.password_hash) {
        sendError(res, 401, 'Invalid credentials', 'UNAUTHORIZED');
        return;
      }

      if (!user.is_active) {
        sendError(res, 403, 'Account is deactivated', 'FORBIDDEN');
        return;
      }

      let valid = false;
      try {
        valid = await verifyPassword(password, user.password_hash);
      } catch (err) {
        console.warn('Password verification failed during login:', err);
        sendError(res, 401, 'Invalid credentials', 'UNAUTHORIZED');
        return;
      }
      if (!valid) {
        sendError(res, 401, 'Invalid credentials', 'UNAUTHORIZED');
        return;
      }

      // Update last_login_at
      try {
        await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
      } catch (err) {
        console.warn('Unable to update last_login_at for user login:', err);
      }

      const claims: JwtClaims = {
        sub: user.id,
        email: user.email,
        role: user.role as JwtClaims['role'],
        orgId: user.org_id,
      };
      const token = generateToken(claims);

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          orgId: user.org_id,
          orgName: user.org_name,
        },
      });
      return;
    }

    // ── Legacy fallback: ANALYST_USER/ANALYST_PASSWORD ──
    if (
      config.analystUser &&
      config.analystPassword &&
      loginEmail === config.analystUser &&
      password === config.analystPassword
    ) {
      // Check if ANY users exist in the DB
      const countResult = await pool.query('SELECT COUNT(*) AS cnt FROM users');
      const userCount = parseInt(countResult.rows[0].cnt, 10);

      if (userCount === 0) {
        // Auto-create a platform_admin from legacy credentials
        const userId = randomUUID();
        const passwordHash = await hashPassword(password);

        await pool.query(
          `INSERT INTO users (id, email, password_hash, full_name, role, is_active)
           VALUES ($1, $2, $3, 'Legacy Admin', 'platform_admin', true)`,
          [userId, loginEmail, passwordHash]
        );

        const claims: JwtClaims = {
          sub: userId,
          email: loginEmail,
          role: 'platform_admin',
          orgId: null,
        };
        const token = generateToken(claims);

        res.json({
          token,
          user: {
            id: userId,
            email: loginEmail,
            fullName: 'Legacy Admin',
            role: 'platform_admin',
            orgId: null,
            orgName: null,
          },
        });
        return;
      }
    }

    sendError(res, 401, 'Invalid credentials', 'UNAUTHORIZED');
  })
);

// ---------------------------------------------------------------------------
// POST /auth/accept-invite — accept a team invitation
// ---------------------------------------------------------------------------
authRouter.post(
  '/accept-invite',
  asyncHandler(async (req, res) => {
    const { token, fullName, password } = req.body as {
      token?: string;
      fullName?: string;
      password?: string;
    };

    if (!token || !fullName || !password) {
      sendError(res, 400, 'token, fullName, and password are required', 'VALIDATION_ERROR');
      return;
    }

    if (password.length < 8) {
      sendError(res, 400, 'Password must be at least 8 characters', 'VALIDATION_ERROR');
      return;
    }

    // ── Look up invitation ──
    const invResult = await pool.query(
      `SELECT i.id, i.org_id, i.email, i.role, i.status, i.expires_at,
              o.name AS org_name
       FROM org_invitations i
       JOIN organizations o ON o.id = i.org_id
       WHERE i.token = $1`,
      [token]
    );

    if (!invResult.rowCount || invResult.rowCount === 0) {
      sendError(res, 404, 'Invitation not found', 'NOT_FOUND');
      return;
    }

    const inv = invResult.rows[0] as {
      id: string;
      org_id: string;
      email: string;
      role: string;
      status: string;
      expires_at: Date;
      org_name: string;
    };

    if (inv.status !== 'pending') {
      sendError(res, 400, 'Invitation has already been used or expired', 'VALIDATION_ERROR');
      return;
    }

    if (new Date(inv.expires_at) < new Date()) {
      await pool.query(
        "UPDATE org_invitations SET status = 'expired' WHERE id = $1",
        [inv.id]
      );
      sendError(res, 400, 'Invitation has expired', 'VALIDATION_ERROR');
      return;
    }

    // ── Check email not already taken ──
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [inv.email.toLowerCase()]
    );
    if (existingUser.rowCount && existingUser.rowCount > 0) {
      sendError(res, 409, 'An account with this email already exists', 'VALIDATION_ERROR');
      return;
    }

    // ── Create user + accept invitation in transaction ──
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userId = randomUUID();
      const passwordHash = await hashPassword(password);

      await client.query(
        `INSERT INTO users (id, email, password_hash, full_name, role, org_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [userId, inv.email.toLowerCase(), passwordHash, fullName, inv.role, inv.org_id]
      );

      await client.query(
        "UPDATE org_invitations SET status = 'accepted' WHERE id = $1",
        [inv.id]
      );

      await client.query('COMMIT');

      const claims: JwtClaims = {
        sub: userId,
        email: inv.email.toLowerCase(),
        role: inv.role as JwtClaims['role'],
        orgId: inv.org_id,
      };
      const jwtToken = generateToken(claims);

      res.status(201).json({
        token: jwtToken,
        user: {
          id: userId,
          email: inv.email.toLowerCase(),
          fullName,
          role: inv.role,
          orgId: inv.org_id,
          orgName: inv.org_name,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);
