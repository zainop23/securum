import { Router } from 'express';
import {
  asyncHandler,
  sendError,
  requireJwt,
  requireRole,
  AuthenticatedRequest,
} from '../auth/rbac';
import { pool } from '../db';

export const adminRouter = Router();

// All admin routes require auth + platform_admin role
adminRouter.use(requireJwt, requireRole('platform_admin'));

// ---------------------------------------------------------------------------
// GET /admin/stats — platform overview
// ---------------------------------------------------------------------------
adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const orgsResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_orgs,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active_orgs,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orgs
       FROM organizations`
    );

    const usersResult = await pool.query('SELECT COUNT(*)::int AS total_users FROM users');

    const queriesResult = await pool.query('SELECT COUNT(*)::int AS total_queries FROM queries');

    const budgetResult = await pool.query(
      'SELECT COALESCE(SUM(epsilon_spent), 0) AS total_epsilon_spent FROM privacy_budget'
    );

    const stats = {
      totalOrgs: orgsResult.rows[0].total_orgs,
      activeOrgs: orgsResult.rows[0].active_orgs,
      pendingOrgs: orgsResult.rows[0].pending_orgs,
      totalUsers: usersResult.rows[0].total_users,
      totalQueries: queriesResult.rows[0].total_queries,
      totalEpsilonSpent: parseFloat(budgetResult.rows[0].total_epsilon_spent),
    };

    res.json(stats);
  })
);

// ---------------------------------------------------------------------------
// GET /admin/orgs — all orgs
// ---------------------------------------------------------------------------
adminRouter.get(
  '/orgs',
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT
         o.id, o.name, o.status, o.onboarding_step, o.created_at, o.updated_at,
         (SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.id) AS member_count,
         (SELECT COUNT(*)::int FROM queries q WHERE q.org_id = o.id) AS query_count
       FROM organizations o
       ORDER BY o.created_at DESC`
    );

    res.json({ orgs: result.rows });
  })
);

// ---------------------------------------------------------------------------
// PUT /admin/orgs/:orgId/status — activate/suspend org
// ---------------------------------------------------------------------------
adminRouter.put(
  '/orgs/:orgId/status',
  asyncHandler(async (req, res) => {
    const { orgId } = req.params;
    const { status } = req.body as { status?: string };

    if (!status || !['active', 'inactive'].includes(status)) {
      sendError(res, 400, 'status must be "active" or "inactive"', 'VALIDATION_ERROR');
      return;
    }

    const result = await pool.query(
      'UPDATE organizations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [status, orgId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      sendError(res, 404, 'Organization not found', 'NOT_FOUND');
      return;
    }

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// GET /admin/users — all users
// ---------------------------------------------------------------------------
adminRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at, u.created_at,
              u.org_id, o.name AS org_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.org_id
       ORDER BY u.created_at DESC`
    );

    res.json({ users: result.rows });
  })
);

// ---------------------------------------------------------------------------
// PUT /admin/users/:userId/status — activate/deactivate user
// ---------------------------------------------------------------------------
adminRouter.put(
  '/users/:userId/status',
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { isActive } = req.body as { isActive?: boolean };

    if (typeof isActive !== 'boolean') {
      sendError(res, 400, 'isActive must be a boolean', 'VALIDATION_ERROR');
      return;
    }

    // Prevent deactivating yourself
    const user = (req as AuthenticatedRequest).user!;
    if (userId === user.sub) {
      sendError(res, 400, 'You cannot deactivate yourself', 'VALIDATION_ERROR');
      return;
    }

    const result = await pool.query(
      'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id',
      [isActive, userId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      sendError(res, 404, 'User not found', 'NOT_FOUND');
      return;
    }

    res.json({ ok: true });
  })
);
