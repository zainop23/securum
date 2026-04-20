import { Router } from 'express';
import { GLOBAL_SCHEMA } from '@securum/shared';
import {
  asyncHandler,
  sendError,
  requireJwt,
  requireRole,
  requireOrgScope,
  AuthenticatedRequest,
} from '../auth/rbac';
import { pool } from '../db';

export const onboardingRouter = Router();

// All onboarding routes require auth + org_admin
onboardingRouter.use(requireJwt, requireRole('org_admin', 'platform_admin'), requireOrgScope);

// ---------------------------------------------------------------------------
// GET /onboarding/status
// ---------------------------------------------------------------------------
onboardingRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    const result = await pool.query(
      `SELECT id, name, onboarding_step, status
       FROM organizations
       WHERE id = $1`,
      [user.orgId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      sendError(res, 404, 'Organization not found', 'NOT_FOUND');
      return;
    }

    const org = result.rows[0] as {
      id: string;
      name: string;
      onboarding_step: string;
      status: string;
    };

    res.json({
      orgId: org.id,
      orgName: org.name,
      currentStep: org.onboarding_step,
      isComplete: org.onboarding_step === 'onboarding_complete',
    });
  })
);

// ---------------------------------------------------------------------------
// PUT /onboarding/node-endpoint
// ---------------------------------------------------------------------------
onboardingRouter.put(
  '/node-endpoint',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const { endpointUrl } = req.body as { endpointUrl?: string };

    if (!endpointUrl) {
      sendError(res, 400, 'endpointUrl is required', 'VALIDATION_ERROR');
      return;
    }

    // Basic URL validation
    try {
      new URL(endpointUrl);
    } catch {
      sendError(res, 400, 'endpointUrl must be a valid URL', 'VALIDATION_ERROR');
      return;
    }

    await pool.query(
      `UPDATE organizations
       SET endpoint_url = $1,
           onboarding_step = 'node_endpoint_configured',
           updated_at = NOW()
       WHERE id = $2`,
      [endpointUrl, user.orgId]
    );

    res.json({ ok: true, step: 'node_endpoint_configured' });
  })
);

// ---------------------------------------------------------------------------
// PUT /onboarding/schema-map
// ---------------------------------------------------------------------------
onboardingRouter.put(
  '/schema-map',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const { schemaMap } = req.body as { schemaMap?: Record<string, unknown> };

    if (!schemaMap) {
      sendError(res, 400, 'schemaMap is required', 'VALIDATION_ERROR');
      return;
    }

    // Validate structure: must have "tables" and "columns" keys
    const sm = schemaMap as { tables?: unknown; columns?: unknown };
    if (!sm.tables || typeof sm.tables !== 'object') {
      sendError(res, 400, 'schemaMap must contain a "tables" object', 'VALIDATION_ERROR');
      return;
    }
    if (!sm.columns || typeof sm.columns !== 'object') {
      sendError(res, 400, 'schemaMap must contain a "columns" object', 'VALIDATION_ERROR');
      return;
    }

    // Validate that all GLOBAL_SCHEMA columns are mapped
    const columns = sm.columns as Record<string, string>;
    for (const [table, cols] of Object.entries(GLOBAL_SCHEMA)) {
      for (const col of cols) {
        if (!(col in columns)) {
          sendError(
            res,
            400,
            `Missing mapping for global column "${col}" (table "${table}")`,
            'VALIDATION_ERROR'
          );
          return;
        }
      }
    }

    // Check that onboarding_step is at least 'node_endpoint_configured'
    const orgResult = await pool.query(
      'SELECT onboarding_step FROM organizations WHERE id = $1',
      [user.orgId]
    );
    const currentStep = orgResult.rows[0]?.onboarding_step;
    if (currentStep === 'account_created') {
      sendError(res, 400, 'Please configure node endpoint first', 'VALIDATION_ERROR');
      return;
    }

    await pool.query(
      `UPDATE organizations
       SET schema_map = $1::jsonb,
           onboarding_step = 'schema_map_uploaded',
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(schemaMap), user.orgId]
    );

    res.json({ ok: true, step: 'schema_map_uploaded' });
  })
);

// ---------------------------------------------------------------------------
// POST /onboarding/test-connectivity
// ---------------------------------------------------------------------------
onboardingRouter.post(
  '/test-connectivity',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    const orgResult = await pool.query(
      'SELECT endpoint_url, onboarding_step FROM organizations WHERE id = $1',
      [user.orgId]
    );

    if (!orgResult.rowCount || orgResult.rowCount === 0) {
      sendError(res, 404, 'Organization not found', 'NOT_FOUND');
      return;
    }

    const org = orgResult.rows[0] as { endpoint_url: string; onboarding_step: string };

    if (!org.endpoint_url) {
      sendError(res, 400, 'No endpoint URL configured', 'VALIDATION_ERROR');
      return;
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(`${org.endpoint_url}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      if (response.ok) {
        await pool.query(
          `UPDATE organizations
           SET onboarding_step = 'connectivity_verified',
               updated_at = NOW()
           WHERE id = $1`,
          [user.orgId]
        );

        res.json({ success: true, latencyMs });
      } else {
        res.json({
          success: false,
          latencyMs,
          error: `Health endpoint returned HTTP ${response.status}`,
        });
      }
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = (err as Error).message ?? String(err);
      res.json({ success: false, latencyMs, error: message });
    }
  })
);

// ---------------------------------------------------------------------------
// POST /onboarding/complete
// ---------------------------------------------------------------------------
onboardingRouter.post(
  '/complete',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    const orgResult = await pool.query(
      'SELECT onboarding_step FROM organizations WHERE id = $1',
      [user.orgId]
    );

    if (!orgResult.rowCount || orgResult.rowCount === 0) {
      sendError(res, 404, 'Organization not found', 'NOT_FOUND');
      return;
    }

    const step = orgResult.rows[0].onboarding_step as string;

    if (step !== 'connectivity_verified') {
      sendError(
        res,
        400,
        `Cannot complete onboarding from step "${step}". Must be at "connectivity_verified".`,
        'VALIDATION_ERROR'
      );
      return;
    }

    await pool.query(
      `UPDATE organizations
       SET onboarding_step = 'onboarding_complete',
           status = 'active',
           updated_at = NOW()
       WHERE id = $1`,
      [user.orgId]
    );

    res.json({ ok: true, step: 'onboarding_complete' });
  })
);
