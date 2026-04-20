/* ===================================================================
   Phase 6 Migration — Users, Invitations, Org Extensions
   =================================================================== */

/* ── Users table: replaces hardcoded ANALYST_USER/ANALYST_PASSWORD ── */
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'analyst'
        CHECK (role IN ('platform_admin', 'org_admin', 'analyst')),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

/* ── Org Invitations: for team invites ── */
CREATE TABLE IF NOT EXISTS org_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'analyst'
        CHECK (role IN ('org_admin', 'analyst')),
    invited_by UUID NOT NULL REFERENCES users(id),
    token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

/* ── Extend organizations table ── */
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_step VARCHAR(50) DEFAULT 'account_created'
    CHECK (onboarding_step IN (
        'account_created',
        'node_endpoint_configured',
        'schema_map_uploaded',
        'connectivity_verified',
        'onboarding_complete'
    ));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS schema_map JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS privacy_budget_limit NUMERIC(10,4) DEFAULT 10.0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_epsilon_per_query NUMERIC(10,4) DEFAULT 5.0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

/* ── Extend queries table for multi-tenant scoping ── */
ALTER TABLE queries ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

/* ── Indexes ── */
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(org_id);
