import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  asyncHandler,
  sendError,
  requireJwt,
  requireRole,
  requireOrgScope,
  AuthenticatedRequest,
} from '../auth/rbac';
import { pool } from '../db';

export const orgsRouter = Router();

// All org routes require auth + org scope
orgsRouter.use(requireJwt, requireOrgScope);

// ---------------------------------------------------------------------------
// GET /orgs/me — org profile
// ---------------------------------------------------------------------------
orgsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    const result = await pool.query(
      `SELECT id, name, description, endpoint_url, status, onboarding_step,
              privacy_budget_limit, max_epsilon_per_query, created_at, updated_at
       FROM organizations
       WHERE id = $1`,
      [user.orgId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      sendError(res, 404, 'Organization not found', 'NOT_FOUND');
      return;
    }

    res.json({ org: result.rows[0] });
  })
);

// ---------------------------------------------------------------------------
// PUT /orgs/me — update org details (org_admin only)
// ---------------------------------------------------------------------------
orgsRouter.put(
  '/me',
  requireRole('org_admin', 'platform_admin'),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const { name, description } = req.body as {
      name?: string;
      description?: string;
    };

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIdx++}`);
      params.push(description);
    }

    if (updates.length === 0) {
      sendError(res, 400, 'No fields to update', 'VALIDATION_ERROR');
      return;
    }

    updates.push(`updated_at = NOW()`);
    params.push(user.orgId);

    await pool.query(
      `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      params
    );

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// GET /orgs/me/members — list org members (org_admin only)
// ---------------------------------------------------------------------------
orgsRouter.get(
  '/me/members',
  requireRole('org_admin', 'platform_admin'),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    const result = await pool.query(
      `SELECT id, email, full_name, role, is_active, last_login_at, created_at
       FROM users
       WHERE org_id = $1
       ORDER BY created_at ASC`,
      [user.orgId]
    );

    res.json({ members: result.rows });
  })
);

// ---------------------------------------------------------------------------
// POST /orgs/me/invite — invite team member (org_admin only)
// ---------------------------------------------------------------------------
orgsRouter.post(
  '/me/invite',
  requireRole('org_admin', 'platform_admin'),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const { email, role } = req.body as { email?: string; role?: string };

    if (!email) {
      sendError(res, 400, 'email is required', 'VALIDATION_ERROR');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      sendError(res, 400, 'Invalid email format', 'VALIDATION_ERROR');
      return;
    }

    const inviteRole = role || 'analyst';
    if (!['org_admin', 'analyst'].includes(inviteRole)) {
      sendError(res, 400, 'role must be "org_admin" or "analyst"', 'VALIDATION_ERROR');
      return;
    }

    // Check if user already exists with this email
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existingUser.rowCount && existingUser.rowCount > 0) {
      sendError(res, 409, 'A user with this email already exists', 'VALIDATION_ERROR');
      return;
    }

    // Check for existing pending invitation
    const existingInvite = await pool.query(
      "SELECT id FROM org_invitations WHERE email = $1 AND org_id = $2 AND status = 'pending'",
      [email.toLowerCase(), user.orgId]
    );
    if (existingInvite.rowCount && existingInvite.rowCount > 0) {
      sendError(res, 409, 'An invitation for this email is already pending', 'VALIDATION_ERROR');
      return;
    }

    const invitationId = randomUUID();
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      `INSERT INTO org_invitations (id, org_id, email, role, invited_by, token, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
      [invitationId, user.orgId, email.toLowerCase(), inviteRole, user.sub, token, expiresAt]
    );

    // Simulated email log
    console.log(`[EMAIL] To: ${email}`);
    console.log(`[EMAIL] Subject: You're invited to join an organization on Securum`);
    console.log(`[EMAIL] Body: Accept your invite: /invite/${token}`);

    res.status(201).json({ invitationId, token });
  })
);

// ---------------------------------------------------------------------------
// DELETE /orgs/me/members/:userId — remove member (org_admin only)
// ---------------------------------------------------------------------------
orgsRouter.delete(
  '/me/members/:userId',
  requireRole('org_admin', 'platform_admin'),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const targetUserId = req.params.userId;

    // Can't remove yourself
    if (targetUserId === user.sub) {
      sendError(res, 400, 'You cannot remove yourself', 'VALIDATION_ERROR');
      return;
    }

    // Verify target belongs to the same org
    const targetResult = await pool.query(
      'SELECT id, org_id FROM users WHERE id = $1',
      [targetUserId]
    );

    if (!targetResult.rowCount || targetResult.rowCount === 0) {
      sendError(res, 404, 'User not found', 'NOT_FOUND');
      return;
    }

    const target = targetResult.rows[0] as { id: string; org_id: string };
    if (target.org_id !== user.orgId) {
      sendError(res, 403, 'Cannot modify users outside your organization', 'FORBIDDEN');
      return;
    }

    await pool.query(
      'UPDATE users SET org_id = NULL, is_active = false WHERE id = $1',
      [targetUserId]
    );

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// PUT /orgs/me/members/:userId/role — change role (org_admin only)
// ---------------------------------------------------------------------------
orgsRouter.put(
  '/me/members/:userId/role',
  requireRole('org_admin', 'platform_admin'),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const targetUserId = req.params.userId;
    const { role } = req.body as { role?: string };

    if (!role) {
      sendError(res, 400, 'role is required', 'VALIDATION_ERROR');
      return;
    }

    // ── Role escalation prevention ──
    if (role === 'platform_admin') {
      sendError(res, 403, 'Cannot assign platform_admin role', 'FORBIDDEN');
      return;
    }

    if (!['org_admin', 'analyst'].includes(role)) {
      sendError(res, 400, 'role must be "org_admin" or "analyst"', 'VALIDATION_ERROR');
      return;
    }

    // Can't change your own role
    if (targetUserId === user.sub) {
      sendError(res, 400, 'You cannot change your own role', 'VALIDATION_ERROR');
      return;
    }

    // Verify target belongs to the same org
    const targetResult = await pool.query(
      'SELECT id, org_id FROM users WHERE id = $1',
      [targetUserId]
    );

    if (!targetResult.rowCount || targetResult.rowCount === 0) {
      sendError(res, 404, 'User not found', 'NOT_FOUND');
      return;
    }

    const target = targetResult.rows[0] as { id: string; org_id: string };
    if (target.org_id !== user.orgId) {
      sendError(res, 403, 'Cannot modify users outside your organization', 'FORBIDDEN');
      return;
    }

    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, targetUserId]);

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// GET /orgs/me/privacy-budget — budget summary
// ---------------------------------------------------------------------------
orgsRouter.get(
  '/me/privacy-budget',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    if (user.role === 'platform_admin' && !user.orgId) {
      const totalsResult = await pool.query(
        `SELECT
           COALESCE(SUM(privacy_budget_limit), 0) AS total_budget
         FROM organizations`
      );
      const totalBudget = parseFloat(totalsResult.rows[0]?.total_budget ?? '0');

      const spentResult = await pool.query(
        'SELECT COALESCE(SUM(epsilon_spent), 0) AS spent, COUNT(*) AS query_count FROM privacy_budget'
      );
      const spent = parseFloat(spentResult.rows[0].spent);
      const queryCount = parseInt(spentResult.rows[0].query_count, 10);

      const historyResult = await pool.query(
        `SELECT pb.query_id, pb.epsilon_spent, pb.created_at
         FROM privacy_budget pb
         ORDER BY pb.created_at DESC
         LIMIT 50`
      );

      res.json({
        totalBudget,
        spent,
        remaining: Math.max(totalBudget - spent, 0),
        queryCount,
        history: historyResult.rows,
      });
      return;
    }

    const orgResult = await pool.query(
      'SELECT privacy_budget_limit FROM organizations WHERE id = $1',
      [user.orgId]
    );
    const totalBudget = parseFloat(orgResult.rows[0]?.privacy_budget_limit ?? '10');

    const spentResult = await pool.query(
      'SELECT COALESCE(SUM(epsilon_spent), 0) AS spent, COUNT(*) AS query_count FROM privacy_budget WHERE org_id = $1',
      [user.orgId]
    );
    const spent = parseFloat(spentResult.rows[0].spent);
    const queryCount = parseInt(spentResult.rows[0].query_count, 10);

    const historyResult = await pool.query(
      `SELECT pb.query_id, pb.epsilon_spent, pb.created_at
       FROM privacy_budget pb
       WHERE pb.org_id = $1
       ORDER BY pb.created_at DESC
       LIMIT 50`,
      [user.orgId]
    );

    res.json({
      totalBudget,
      spent,
      remaining: Math.max(totalBudget - spent, 0),
      queryCount,
      history: historyResult.rows,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /orgs/me/settings — current settings
// ---------------------------------------------------------------------------
orgsRouter.get(
  '/me/settings',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    const result = await pool.query(
      `SELECT id, name, description, endpoint_url, schema_map,
              privacy_budget_limit, max_epsilon_per_query, onboarding_step,
              status, created_at, updated_at
       FROM organizations
       WHERE id = $1`,
      [user.orgId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      sendError(res, 404, 'Organization not found', 'NOT_FOUND');
      return;
    }

    res.json({ settings: result.rows[0] });
  })
);

// ---------------------------------------------------------------------------
// PUT /orgs/me/settings — update settings (org_admin only)
// ---------------------------------------------------------------------------
orgsRouter.put(
  '/me/settings',
  requireRole('org_admin', 'platform_admin'),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const { privacyBudgetLimit, maxEpsilonPerQuery } = req.body as {
      privacyBudgetLimit?: number;
      maxEpsilonPerQuery?: number;
    };

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (privacyBudgetLimit !== undefined) {
      if (typeof privacyBudgetLimit !== 'number' || privacyBudgetLimit <= 0) {
        sendError(res, 400, 'privacyBudgetLimit must be a positive number', 'VALIDATION_ERROR');
        return;
      }
      updates.push(`privacy_budget_limit = $${paramIdx++}`);
      params.push(privacyBudgetLimit);
    }

    if (maxEpsilonPerQuery !== undefined) {
      if (typeof maxEpsilonPerQuery !== 'number' || maxEpsilonPerQuery <= 0) {
        sendError(res, 400, 'maxEpsilonPerQuery must be a positive number', 'VALIDATION_ERROR');
        return;
      }
      updates.push(`max_epsilon_per_query = $${paramIdx++}`);
      params.push(maxEpsilonPerQuery);
    }

    if (updates.length === 0) {
      sendError(res, 400, 'No fields to update', 'VALIDATION_ERROR');
      return;
    }

    updates.push(`updated_at = NOW()`);
    params.push(user.orgId);

    await pool.query(
      `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      params
    );

    res.json({ ok: true });
  })
);
