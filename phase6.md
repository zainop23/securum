# Phase 6 — SaaS Platform: Organization Registration, Onboarding & Full Workflow *(Both)*

> **Owners:** Zain (backend, DB, auth) + Rahul (frontend, UX flows)
> **Effort estimate:** 5–7 days
> **Depends on:** Phase 5 (dashboard is functional, full commit–reveal pipeline works end-to-end)
> **Milestone:** Securum is a proper multi-tenant SaaS platform. Organizations can self-register, onboard their nodes, manage their teams, and go through a complete lifecycle — from sign-up to running privacy-preserving queries. An admin panel provides platform-wide oversight.

---

## Overview

Currently Securum is a functional privacy analytics demo, but it lacks a real SaaS workflow:

- **No self-service registration** — orgs are registered via a JWT-protected `POST /orgs/register` by an analyst. There's no org sign-up flow.
- **Single hardcoded analyst account** — `ANALYST_USER/ANALYST_PASSWORD` env vars. No user management, no role-based access.
- **No org-level auth** — Org admins can't log in to a dashboard to manage their nodes, view their privacy budget, or configure settings.
- **No onboarding workflow** — After registration, there's no guided flow for connecting an org-node, uploading a schema map, or verifying connectivity.
- **No admin panel** — No platform-wide visibility into orgs, queries, budgets, or system health.

This phase transforms Securum into a proper SaaS platform with a complete user journey.

---

## Architecture Changes

```
┌──────────────────────────────────────────────────────────────┐
│                     SECURUM SaaS PLATFORM                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌──────────────────┐    ┌────────────┐  │
│  │  Landing /   │───▶│   Auth Service    │───▶│  Dashboard  │  │
│  │  Sign-up UI  │    │  (JWT + Roles)    │    │  (React)    │  │
│  └─────────────┘    └──────────────────┘    └────────────┘  │
│                              │                      │        │
│                              ▼                      ▼        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Coordinator API (Express)                 │   │
│  │                                                        │   │
│  │  /auth/*          - Login, Register, Password Reset    │   │
│  │  /orgs/*          - Org CRUD, Onboarding, Settings     │   │
│  │  /orgs/:id/users  - Org Member Management              │   │
│  │  /query           - Submit Queries (role-gated)        │   │
│  │  /results/*       - View Results (role-gated)          │   │
│  │  /admin/*         - Platform Admin Panel               │   │
│  │  /onboarding/*    - Guided Setup Wizard                │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│              ┌───────────────┼───────────────┐              │
│              ▼               ▼               ▼              │
│        ┌──────────┐   ┌──────────┐   ┌──────────┐         │
│        │ Org Node 1│   │ Org Node 2│   │ Org Node N│         │
│        │ (self-    │   │ (self-    │   │ (self-    │         │
│        │  hosted)  │   │  hosted)  │   │  hosted)  │         │
│        └──────────┘   └──────────┘   └──────────┘         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### New Tables (add to `docker/postgres-init/init.sql`)

```sql
/* ── Users table: replaces hardcoded ANALYST_USER/ANALYST_PASSWORD ── */
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'analyst'
        CHECK (role IN ('platform_admin', 'org_admin', 'analyst', 'viewer')),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

/* ── Org Invitations: for team invites ── */
CREATE TABLE org_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'analyst'
        CHECK (role IN ('org_admin', 'analyst', 'viewer')),
    invited_by UUID NOT NULL REFERENCES users(id),
    token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

/* ── Org Settings: configurable per-org settings ── */
CREATE TABLE org_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    privacy_budget_limit NUMERIC(10,4) DEFAULT 10.0,
    max_epsilon_per_query NUMERIC(10,4) DEFAULT 5.0,
    auto_approve_queries BOOLEAN DEFAULT false,
    notification_email VARCHAR(255),
    schema_map JSONB,                          -- stored schema map (uploaded during onboarding)
    node_endpoint_verified BOOLEAN DEFAULT false,
    onboarding_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

/* ── Onboarding Steps Tracker ── */
CREATE TABLE onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    step VARCHAR(50) NOT NULL
        CHECK (step IN (
            'account_created',
            'org_details_filled',
            'node_endpoint_configured',
            'schema_map_uploaded',
            'connectivity_verified',
            'first_query_run',
            'onboarding_complete'
        )),
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,
    UNIQUE(org_id, step)
);

/* ── API Keys table: support multiple keys per org ── */
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(8) NOT NULL,         -- first 8 chars for identification (e.g., "sk_live_ab")
    permissions JSONB DEFAULT '["execute_queries"]'::jsonb,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

/* ── Session / Refresh Tokens (optional, for token rotation) ── */
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

/* ── Indexes ── */
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_org_invitations_token ON org_invitations(token);
CREATE INDEX idx_org_invitations_org ON org_invitations(org_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_org ON api_keys(org_id);
CREATE INDEX idx_onboarding_org ON onboarding_progress(org_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

### Modify Existing Tables

```sql
/* Add columns to organizations */
ALTER TABLE organizations ADD COLUMN description TEXT;
ALTER TABLE organizations ADD COLUMN logo_url VARCHAR(512);
ALTER TABLE organizations ADD COLUMN plan VARCHAR(30) DEFAULT 'free'
    CHECK (plan IN ('free', 'starter', 'professional', 'enterprise'));
ALTER TABLE organizations ADD COLUMN max_users INTEGER DEFAULT 5;
ALTER TABLE organizations ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

/* Add org_id to queries for multi-tenant scoping */
ALTER TABLE queries ADD COLUMN org_id UUID REFERENCES organizations(id);
```

> **Migration note:** Since `docker-entrypoint-initdb.d` only runs on first volume creation, add these as ALTER statements in a separate migration file `docker/postgres-init/002-phase6-migration.sql`, OR blow away volumes with `docker compose down -v` and add everything to the original `init.sql`.

---

## Complete User Journey (The SaaS Workflow)

### Flow 1: Organization Sign-Up & Onboarding

```
1. Landing Page → "Get Started" CTA
2. Sign-Up Form: org name, admin email, admin full name, password
3. Email verification (simulated for demo — auto-verified in dev)
4. Org Dashboard: Onboarding Wizard starts
   ├─ Step 1: Fill org details (description, logo)
   ├─ Step 2: Configure org-node endpoint URL
   ├─ Step 3: Upload/paste schema map JSON
   ├─ Step 4: Generate API key → shown ONCE → download as .env snippet
   ├─ Step 5: Connectivity test (coordinator pings org-node /health)
   └─ Step 6: Run a test query (optional)
5. Onboarding Complete → Full Dashboard Access
```

### Flow 2: Team Member Invitation

```
1. Org Admin → Settings → Team
2. Invite by email + select role (analyst, viewer, org_admin)
3. Invitee receives link (simulated — token URL shown in UI for demo)
4. Invitee clicks link → sign-up form (pre-filled email) → joins org
```

### Flow 3: Analyst Query Workflow

```
1. Login → Dashboard Home
2. Query Builder → Select aggregate, column, groupBy, epsilon
3. Submit → Loading → Results (table + chart)
4. View privacy budget consumption
5. History → Re-examine past queries
```

### Flow 4: Platform Admin

```
1. Login with platform_admin role
2. Admin Dashboard:
   ├── All orgs overview (name, status, plan, member count, query count)
   ├── All users across orgs
   ├── System-wide query metrics
   ├── Privacy budget utilization across orgs
   ├── Audit log viewer (global)
   └── Org approval/suspension
```

---

## Task Breakdown

### Task 1 — Auth System Overhaul (Zain — Backend)

**Where:** `packages/coordinator/src/auth/`

Replace the hardcoded `ANALYST_USER/ANALYST_PASSWORD` with a proper user system.

#### 1.1 Password Hashing
- Install `bcryptjs` (pure JS, no native deps — Docker-friendly).
- `hashPassword(plain) → bcrypt hash` (salt rounds = 12).
- `verifyPassword(plain, hash) → boolean`.

#### 1.2 Registration Endpoint
- `POST /auth/register` — body: `{ email, password, fullName, orgName }`.
- **Flow:**
  1. Validate email format, password strength (min 8 chars, 1 uppercase, 1 number).
  2. Check email not already taken.
  3. Create `organizations` row (name = orgName, status = 'pending').
  4. Create `users` row (role = 'org_admin', org_id = new org, email_verified = true for dev).
  5. Create `org_settings` row with defaults.
  6. Create first `onboarding_progress` entry: `account_created`.
  7. Return `{ token, user: { id, email, fullName, role, orgId } }`.
- **Gotcha:** Wrap org + user + settings creation in a DB transaction. If user insert fails (e.g. duplicate email), the org should NOT be left orphaned.

#### 1.3 Login Endpoint (Updated)
- `POST /auth/login` — body: `{ email, password }`.
- Replace the hardcoded check with a DB lookup:
  1. Find user by email.
  2. Verify password with bcrypt.
  3. Check `is_active = true`.
  4. Update `last_login_at`.
  5. Generate JWT: `{ sub: user.id, email, role, orgId }`.
  6. Return `{ token, user: { id, email, fullName, role, orgId, orgName } }`.
- **Keep backward compatibility:** If `ANALYST_USER`/`ANALYST_PASSWORD` env vars are set AND no users exist in DB, allow legacy login (creates a platform_admin user on first login). This lets existing docker setups still work.

#### 1.4 JWT Claims Update
- **Current:** `{ sub: username, role: 'analyst' }`
- **New:** `{ sub: userId, email, role, orgId }`
- Update `requireJwt` middleware to extract and validate the new claims.

#### 1.5 Role-Based Access Control (RBAC)
- Create middleware factory: `requireRole(...roles: string[])`.
  ```typescript
  function requireRole(...roles: string[]) {
    return (req, res, next) => {
      const user = (req as AuthenticatedRequest).user;
      if (!user || !roles.includes(user.role)) {
        return sendError(res, 403, 'Insufficient permissions', 'UNAUTHORIZED');
      }
      next();
    };
  }
  ```
- **Permission matrix:**

  | Endpoint | platform_admin | org_admin | analyst | viewer |
  |----------|:-:|:-:|:-:|:-:|
  | `POST /query` | ✅ | ✅ | ✅ | ❌ |
  | `GET /results/*` | ✅ | ✅ | ✅ | ✅ |
  | `GET /orgs` | ✅ | own org | own org | own org |
  | `POST /orgs/register` | ✅ | ❌ | ❌ | ❌ |
  | `GET /admin/*` | ✅ | ❌ | ❌ | ❌ |
  | Org settings | ✅ | own org | ❌ | ❌ |
  | Invite users | ✅ | own org | ❌ | ❌ |

#### 1.6 Refresh Token (Optional Enhancement)
- On login, also return a `refreshToken` (opaque, stored hashed in `refresh_tokens`).
- `POST /auth/refresh` — exchange refresh token for new JWT.
- Refresh token expires in 7 days, JWT in 1 hour.

---

### Task 2 — Onboarding API (Zain — Backend)

**Where:** `packages/coordinator/src/routes/onboarding.ts`

#### 2.1 Onboarding Status
- `GET /onboarding/status` — returns org's current step + completion status.
- Reads from `onboarding_progress` joined with `org_settings`.
- Returns: `{ orgId, steps: [{step, completedAt}], currentStep, isComplete }`.

#### 2.2 Update Org Details
- `PUT /onboarding/org-details` — body: `{ description, logoUrl }`.
- Updates `organizations` table.
- Records `org_details_filled` in `onboarding_progress`.

#### 2.3 Configure Node Endpoint
- `PUT /onboarding/node-endpoint` — body: `{ endpointUrl }`.
- Validates URL format.
- Updates `organizations.endpoint_url`.
- Records `node_endpoint_configured`.

#### 2.4 Upload Schema Map
- `PUT /onboarding/schema-map` — body: `{ schemaMap: {...} }`.
- Validates schema map structure: must have `tables` and `columns` keys, all `GLOBAL_SCHEMA` columns must be mapped.
- Stores in `org_settings.schema_map`.
- Records `schema_map_uploaded`.

#### 2.5 Generate API Key
- `POST /onboarding/api-key` — body: `{ keyName }`.
- Generates key: `sk_live_` + `randomBytes(32).toString('hex')`.
- Stores hash in `api_keys` table. Stores first 8 chars as `key_prefix`.
- Returns `{ apiKeyId, apiKey, prefix }` — **key shown once, never stored in plain text**.
- Also records step progress.

#### 2.6 Connectivity Test
- `POST /onboarding/test-connectivity` — no body.
- Reads org's `endpoint_url` from DB.
- Makes `GET {endpointUrl}/health` with a 10-second timeout.
- Returns `{ success: true/false, latencyMs, error? }`.
- If success, updates `org_settings.node_endpoint_verified = true`, records `connectivity_verified`.

#### 2.7 Complete Onboarding
- `POST /onboarding/complete` — marks onboarding as done.
- Checks all required steps are present.
- Updates org status from `pending` → `active`.
- Sets `org_settings.onboarding_completed_at`.

---

### Task 3 — Org Management & Team APIs (Zain — Backend)

**Where:** `packages/coordinator/src/routes/orgs.ts`

#### 3.1 Org Profile
- `GET /orgs/me` — returns full org profile for the logged-in user's org.
- `PUT /orgs/me` — update org details (name, description, logo). Org_admin only.

#### 3.2 Team Management
- `GET /orgs/me/members` — list all users in the org. Org_admin only.
- `POST /orgs/me/invite` — body: `{ email, role }`. Creates invitation with a token (UUID). Token expires in 7 days. Org_admin only.
- `DELETE /orgs/me/members/:userId` — remove a member. Can't remove yourself. Org_admin only.
- `PUT /orgs/me/members/:userId/role` — change a member's role. Org_admin only.

#### 3.3 Invitation Acceptance
- `POST /auth/accept-invite` — body: `{ token, fullName, password }`.
- Loads invitation by token, checks not expired/revoked.
- Creates user with the invited role and org.
- Marks invitation as accepted.
- Returns JWT + user info (auto-login).

#### 3.4 API Key Management
- `GET /orgs/me/api-keys` — list keys (id, name, prefix, lastUsed, createdAt). Never return full key.
- `POST /orgs/me/api-keys` — generate new key. Same logic as onboarding.
- `DELETE /orgs/me/api-keys/:keyId` — revoke a key (set `is_active = false`).

#### 3.5 Privacy Budget Dashboard Data
- `GET /orgs/me/privacy-budget` — returns `{ totalBudget, spent, remaining, queryCount, history: [{queryId, epsilon, createdAt}] }`.
- Aggregates from `privacy_budget` table.

#### 3.6 Org Settings
- `GET /orgs/me/settings` — current settings.
- `PUT /orgs/me/settings` — update settings (privacy limits, notification email, etc.). Org_admin only.

---

### Task 4 — Admin Panel API (Zain — Backend)

**Where:** `packages/coordinator/src/routes/admin.ts`

All admin routes require `platform_admin` role.

#### 4.1 Platform Overview
- `GET /admin/stats` — returns:
  ```json
  {
    "totalOrgs": 12,
    "activeOrgs": 10,
    "pendingOrgs": 2,
    "totalUsers": 45,
    "totalQueries": 234,
    "queriesLast24h": 15,
    "totalEpsilonSpent": 87.5
  }
  ```

#### 4.2 Org Management
- `GET /admin/orgs` — paginated list of all orgs with member count, query count, status, plan.
- `GET /admin/orgs/:orgId` — detailed org view (members, queries, budget, settings).
- `PUT /admin/orgs/:orgId/status` — activate/suspend an org.
- `PUT /admin/orgs/:orgId/plan` — change org plan (free/starter/professional/enterprise).

#### 4.3 User Management
- `GET /admin/users` — paginated list of all users across all orgs.
- `PUT /admin/users/:userId/status` — activate/deactivate a user.

#### 4.4 Global Audit Log
- `GET /admin/audit` — paginated, filterable audit log viewer. Filters: `orgId`, `eventType`, `dateRange`.

#### 4.5 System Health
- `GET /admin/health` — checks coordinator DB, attempts to ping all active org-nodes. Returns per-org health status.

---

### Task 5 — Frontend: Landing & Auth Pages (Rahul — Frontend)

**Where:** `packages/dashboard/src/pages/`

#### 5.1 Landing Page (`/`)
- Public page (no auth required).
- **Hero section:** Headline + sub-headline + "Get Started" / "Sign In" CTAs.
- **Feature cards:** Privacy-preserving analytics, Differential Privacy, Commit-Reveal Protocol, Self-hosted.
- **How it works:** 3-step visual (Register → Connect → Query).
- **Footer:** Links, copyright.
- Use modern design: gradient backgrounds, glassmorphism cards, subtle animations.
- **Gotcha:** This replaces the current Home page at `/`. The authenticated home moves to `/dashboard`.

#### 5.2 Sign-Up Page (`/signup`)
- Form: Organization Name, Admin Full Name, Email, Password, Confirm Password.
- Client-side validation with real-time feedback.
- Submit → `POST /auth/register` → auto-login → redirect to `/onboarding`.
- Show error states elegantly (duplicate email, weak password).

#### 5.3 Login Page Update (`/login`)
- Update login to use email + password (not username).
- Add "Don't have an account? Sign up" link.
- Add "Forgot password?" link (can be a placeholder for now).

#### 5.4 Invitation Accept Page (`/invite/:token`)
- Public page.
- Load invitation details via token.
- Form: Full Name, Password.
- Submit → `POST /auth/accept-invite` → auto-login → redirect to `/dashboard`.

---

### Task 6 — Frontend: Onboarding Wizard (Rahul — Frontend)

**Where:** `packages/dashboard/src/pages/OnboardingPage.tsx`

#### 6.1 Wizard Component
- Multi-step wizard with progress indicator (stepper UI).
- Steps correspond to the onboarding API:
  1. **Welcome** — Explain what Securum does, show architecture diagram.
  2. **Org Details** — Name (pre-filled), description, optional logo URL.
  3. **Node Setup** — Enter endpoint URL. Explain Docker deployment. Show example docker run command.
  4. **Schema Map** — JSON editor/textarea. Provide example schema map. Validate on paste.
  5. **API Key** — Generate button → show key with copy-to-clipboard. Warning: "Save this key, it won't be shown again." Show `.env` snippet.
  6. **Connectivity Test** — Big "Test Connection" button. Animated check/cross result. Retry option.
  7. **Complete** — 🎉 Celebration animation. "Go to Dashboard" CTA.

#### 6.2 State Management
- Persist wizard state by fetching `GET /onboarding/status` on load.
- Allow going back to completed steps.
- Show completed steps with checkmarks.

#### 6.3 Design Notes
- Use glassmorphism card centered on page.
- Subtle slide transitions between steps.
- Progress bar at top.
- Mobile-responsive (single column).

---

### Task 7 — Frontend: Updated Dashboard (Rahul — Frontend)

**Where:** `packages/dashboard/src/pages/` and `packages/dashboard/src/components/`

#### 7.1 Route Restructure
```
/                  → Landing Page (public)
/login             → Login (public)
/signup            → Sign Up (public)
/invite/:token     → Accept Invitation (public)
/onboarding        → Onboarding Wizard (auth, org_admin)
/dashboard         → Dashboard Home (auth)
/dashboard/query   → Query Builder (auth, analyst+)
/dashboard/results/:id → Result View (auth)
/dashboard/history → Query History (auth)
/dashboard/settings → Org Settings (auth, org_admin)
/dashboard/team    → Team Management (auth, org_admin)
/dashboard/budget  → Privacy Budget (auth)
/admin             → Admin Dashboard (auth, platform_admin)
/admin/orgs        → All Orgs (auth, platform_admin)
/admin/users       → All Users (auth, platform_admin)
/admin/audit       → Audit Log (auth, platform_admin)
```

#### 7.2 Updated Layout Component
- Sidebar navigation with sections:
  - **Analytics:** Dashboard, Query, History
  - **Organization:** Settings, Team, Budget, API Keys
  - **Admin** (if platform_admin): Orgs, Users, Audit
- Show org name + user avatar/initials in sidebar header.
- Collapse on mobile to hamburger menu.

#### 7.3 Org Settings Page (`/dashboard/settings`)
- Org profile form (name, description).
- Privacy settings (budget limit, max epsilon per query).
- Node endpoint URL + re-test connectivity button.
- Schema map viewer/editor.
- Danger zone: "Leave Organization" / "Delete Organization".

#### 7.4 Team Management Page (`/dashboard/team`)
- Member table: Name, Email, Role, Last Login, Actions.
- Invite form (slide-over/modal): Email + Role picker.
- Show pending invitations with ability to revoke.
- Role change dropdown (org_admin only).

#### 7.5 Privacy Budget Page (`/dashboard/budget`)
- **Visual budget meter:** Circular gauge or horizontal progress bar showing used/remaining.
- Budget breakdown table: Query ID, epsilon spent, date.
- Trend chart (line chart) showing cumulative budget consumption over time.

#### 7.6 API Keys Page (`/dashboard/settings` — sub-tab or section)
- List current keys: Name, Prefix (`sk_live_ab...`), Last Used, Created.
- Generate new key modal.
- Revoke key with confirmation dialog.

#### 7.7 Admin Pages
- **Admin Dashboard:** Stat cards (orgs, users, queries, budget) + mini charts.
- **Orgs Table:** Sortable/filterable by status, plan, query count. Action: view, activate, suspend.
- **Users Table:** Sortable by org, role, last login. Action: activate/deactivate.
- **Audit Log:** Filterable table with org/event type/date selectors and JSON payload viewer.

---

### Task 8 — Seed Data & Platform Admin Bootstrap (Both)

#### 8.1 Seed Platform Admin
Add to `docker/postgres-init/init.sql` (or a new `003-seed-admin.sql`):
```sql
/* Password: admin123 (bcrypt hash) */
INSERT INTO users (id, email, password_hash, full_name, role, is_active, email_verified)
VALUES (
    gen_random_uuid(),
    'admin@securum.dev',
    '$2b$12$<BCRYPT_HASH_OF_admin123>',
    'Platform Admin',
    'platform_admin',
    true,
    true
);
```

#### 8.2 Seed Demo Org + Analyst
For the demo environment, also seed:
- 1 org ("Demo Hospital Network") with status `active`.
- 1 org_admin user for that org.
- 1 analyst user for that org.
- Org settings with default values.
- Completed onboarding progress entries.
- An API key.

This ensures `docker compose up` gives a working demo out of the box.

#### 8.3 Auto-Registration Script
Create `docker/scripts/auto-register-orgs.sh`:
- Waits for coordinator to be healthy.
- Registers 3 orgs via the API using the seeded admin account.
- Saves API keys to a file for org-nodes to use.
- This replaces the manual `POST /orgs/register` step from Phase 2.

---

### Task 9 — Email Notifications (Simulated)

For a proper SaaS, email is expected but don't actually set up an email service. Instead:

#### 9.1 Notification Service Skeleton
- `packages/coordinator/src/services/notifications.ts`
- `sendEmail(to, subject, body)` — logs to console with a clear `[EMAIL]` prefix.
- Uses:
  - Registration confirmation
  - Team invitation
  - Password reset link
  - Privacy budget warning (at 80% usage)

#### 9.2 Console Output Format
```
[EMAIL] To: alice@example.com
[EMAIL] Subject: You're invited to join "Hospital Alpha" on Securum
[EMAIL] Body: Click to accept: http://localhost:3000/invite/abc123
```

> This makes it trivial to demo email flows without configuring SMTP. A production system would swap this with Resend, SendGrid, or SES.

---

### Task 10 — Multi-Tenancy Safety (Zain — Backend)

#### 10.1 Data Isolation Middleware
- Create `requireOrgScope` middleware:
  - Extracts `orgId` from JWT claims.
  - Adds `orgId` to all DB queries automatically.
  - Ensures users can only see their own org's data (queries, results, budget).
- Platform admins bypass org scoping.

#### 10.2 Query Scoping
- Update `POST /query` to tag queries with the submitter's `org_id`.
- Update `GET /results` and `GET /results/:queryId` to filter by org.
- Update `GET /audit/:queryId` to verify org ownership.

#### 10.3 Rate Limiting (Lightweight)
- Add a simple in-memory rate limiter (no Redis needed):
  - Auth endpoints: 10 requests/minute per IP.
  - Query endpoint: 20 requests/minute per org.
- Use `express-rate-limit` package.

---

### Task 11 — Password Reset Flow (Optional Enhancement)

#### 11.1 Backend
- `POST /auth/forgot-password` — body: `{ email }`. Generates reset token, logs to console.
- `POST /auth/reset-password` — body: `{ token, newPassword }`. Validates token, updates password.

#### 11.2 Frontend
- `/forgot-password` page — email form.
- `/reset-password/:token` page — new password form.

---

### Task 12 — Docker & Environment Updates (Both)

#### 12.1 New Dependencies
```bash
# Coordinator
npm install bcryptjs express-rate-limit
npm install -D @types/bcryptjs
```

#### 12.2 Updated `.env.example`
```env
# ── Coordinator ──
PORT=4000
DATABASE_URL=postgresql://securum:securum@postgres-coord:5432/securum_coord
JWT_SECRET=change-me-in-production

# ── Auth (legacy — remove after Phase 6 migration) ──
ANALYST_USER=analyst
ANALYST_PASSWORD=analyst123

# ── Platform Admin Bootstrap ──
ADMIN_EMAIL=admin@securum.dev
ADMIN_PASSWORD=admin123

# ── Query Settings ──
QUORUM_MIN=2
DEFAULT_EPSILON=1.0
MAX_EPSILON_PER_ORG=10.0

# ── Dashboard ──
VITE_API_URL=http://localhost:4000
```

#### 12.3 Docker Compose Updates
- Add `ADMIN_EMAIL` and `ADMIN_PASSWORD` to coordinator environment.
- Update dashboard `depends_on` to wait for coordinator healthy.
- Mount migration SQL alongside init SQL.

---

## Gotchas & Pitfalls

### 1. Transaction Safety on Registration
The registration flow creates 3 rows (org, user, org_settings) across 3 tables. If ANY insert fails mid-way, you'll have orphaned rows. **Use `BEGIN...COMMIT` with rollback on error.** This is the #1 source of data corruption in multi-table registration flows.

### 2. JWT Claims Migration
Changing JWT claims (`sub` from username to userId) will invalidate existing tokens. Users must re-login. In a production system, you'd version the JWT claims. For this project, clearing localStorage on upgrade is acceptable.

### 3. Password Hashing is Slow (on Purpose)
bcrypt with 12 salt rounds takes ~250ms per hash. This is intentional — it slows brute-force attacks. But it also means registration/login endpoints have significant latency. Do NOT reduce salt rounds to speed up dev — the demo should reflect real-world behavior.

### 4. Schema Map Upload — Don't Trust Client Validation
Even though the frontend validates the schema map JSON, the backend MUST re-validate. A malformed schema map will cause org-node query execution to fail silently in Phase 4's orchestration engine. Always validate against `GLOBAL_SCHEMA`.

### 5. Role Escalation Prevention
An org_admin can change member roles within their org, but they must NOT be able to:
- Set someone's role to `platform_admin`.
- Change their own role.
- Modify users outside their org.
Add explicit checks for all three cases.

### 6. Backward Compatibility
The existing Phase 1–5 setup uses hardcoded credentials and direct `POST /orgs/register`. Ensure:
- The `test-e2e.sh` script still works (update it to use the new auth).
- `docker compose up` on a fresh clone still boots a working demo.
- The legacy `ANALYST_USER/ANALYST_PASSWORD` login still works if no users table data exists (graceful migration).

---

## Verification & Testing

### API Verification (curl)
```bash
# 1. Register a new org
curl -X POST http://localhost:4000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@hospital.org","password":"SecurePass1","fullName":"Alice Smith","orgName":"Hospital Alpha"}'
# → { token, user: { id, email, role: "org_admin", orgId } }

# 2. Login
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@hospital.org","password":"SecurePass1"}'
# → { token, user: {...} }

# 3. Check onboarding status
curl http://localhost:4000/onboarding/status \
  -H 'Authorization: Bearer <TOKEN>'
# → { steps: [{step: "account_created", completedAt: "..."}], currentStep: "org_details_filled" }

# 4. Complete onboarding steps...
# (configure endpoint, upload schema, generate key, test connectivity)

# 5. Invite team member
curl -X POST http://localhost:4000/orgs/me/invite \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@hospital.org","role":"analyst"}'
# → { invitationId, token }

# 6. Admin stats
curl http://localhost:4000/admin/stats \
  -H 'Authorization: Bearer <ADMIN_TOKEN>'
# → { totalOrgs, activeOrgs, totalUsers, totalQueries, ... }
```

### UI Verification
1. Open `localhost:3000` → See landing page with "Get Started" CTA.
2. Click "Get Started" → Sign-up form → Fill in org details → Submit.
3. Redirected to onboarding wizard → Walk through steps.
4. Generate API key → Copy it → Test connectivity (will fail if no org-node is up — that's expected).
5. Skip to dashboard → See empty state.
6. Go to Team → Invite a member → See pending invitation.
7. Login as `admin@securum.dev` → See admin panel with org listing.
8. Run a query → Verify results still work end-to-end.

### Automated Test Updates
Update `test-e2e.sh` to cover the new flows:
```bash
# Register org via API
# Login as org_admin
# Complete onboarding
# Generate API key
# Submit query
# Verify results
# Check admin stats
```

---

## File Summary

### New Files
| File | Owner | Description |
|------|-------|-------------|
| `packages/coordinator/src/auth/password.ts` | Zain | bcrypt password hashing |
| `packages/coordinator/src/auth/rbac.ts` | Zain | Role-based access middleware |
| `packages/coordinator/src/routes/onboarding.ts` | Zain | Onboarding wizard API |
| `packages/coordinator/src/routes/orgs.ts` | Zain | Org management API (refactored from inline) |
| `packages/coordinator/src/routes/admin.ts` | Zain | Platform admin API |
| `packages/coordinator/src/routes/auth.ts` | Zain | Auth routes (refactored from inline) |
| `packages/coordinator/src/services/notifications.ts` | Zain | Simulated email service |
| `packages/dashboard/src/pages/LandingPage.tsx` | Rahul | Public landing page |
| `packages/dashboard/src/pages/SignupPage.tsx` | Rahul | Org registration page |
| `packages/dashboard/src/pages/OnboardingPage.tsx` | Rahul | Multi-step onboarding wizard |
| `packages/dashboard/src/pages/InvitePage.tsx` | Rahul | Team invitation acceptance |
| `packages/dashboard/src/pages/SettingsPage.tsx` | Rahul | Org settings + API keys |
| `packages/dashboard/src/pages/TeamPage.tsx` | Rahul | Team management |
| `packages/dashboard/src/pages/BudgetPage.tsx` | Rahul | Privacy budget visualization |
| `packages/dashboard/src/pages/admin/AdminDashboard.tsx` | Rahul | Admin overview |
| `packages/dashboard/src/pages/admin/AdminOrgs.tsx` | Rahul | Admin org listing |
| `packages/dashboard/src/pages/admin/AdminUsers.tsx` | Rahul | Admin user listing |
| `packages/dashboard/src/pages/admin/AdminAudit.tsx` | Rahul | Admin audit log |
| `docker/postgres-init/002-phase6-migration.sql` | Zain | New tables + ALTER statements |
| `docker/postgres-init/003-seed-admin.sql` | Zain | Platform admin seed data |

### Modified Files
| File | Owner | Changes |
|------|-------|---------|
| `packages/coordinator/src/index.ts` | Zain | Refactor routes into separate files, mount routers |
| `packages/coordinator/src/config.ts` | Zain | Add `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| `packages/coordinator/package.json` | Zain | Add `bcryptjs`, `express-rate-limit` |
| `packages/dashboard/src/App.tsx` | Rahul | New routes structure |
| `packages/dashboard/src/components/Layout.tsx` | Rahul | Updated sidebar with role-based navigation |
| `packages/dashboard/src/context/AuthContext.tsx` | Rahul | Store full user object, org info |
| `packages/dashboard/src/api/client.ts` | Rahul | Update auth header handling |
| `docker/postgres-init/init.sql` | Zain | Add new tables (or use migration) |
| `docker/docker-compose.yml` | Zain | New env vars, migration mount |
| `.env.example` | Both | New variables documented |
| `test-e2e.sh` | Both | Updated to test new auth + onboarding flows |

---

## Timeline Estimate

| Task | Owner | Effort |
|------|-------|--------|
| Task 1 — Auth System Overhaul | Zain | 1.5 days |
| Task 2 — Onboarding API | Zain | 1 day |
| Task 3 — Org Management + Team APIs | Zain | 1 day |
| Task 4 — Admin Panel API | Zain | 0.5 day |
| Task 5 — Landing + Auth Frontend | Rahul | 1 day |
| Task 6 — Onboarding Wizard Frontend | Rahul | 1 day |
| Task 7 — Updated Dashboard + Admin | Rahul | 1.5 days |
| Task 8 — Seed Data + Bootstrap | Both | 0.5 day |
| Task 9 — Email Notifications (simulated) | Zain | 0.25 day |
| Task 10 — Multi-Tenancy Safety | Zain | 0.5 day |
| Task 11 — Password Reset (optional) | Both | 0.5 day |
| Task 12 — Docker + Env Updates | Both | 0.25 day |
| **Total** | | **~7 days** |

> Zain and Rahul can work in parallel after Task 1 is complete (Rahul needs the auth API to build the frontend). Target: Zain finishes Tasks 1–4 in ~4 days, Rahul starts Tasks 5–7 once Task 1 is merged.

---

## Progress

- [ ] Task 1 — Auth System Overhaul
  - [ ] 1.1 Password hashing (bcrypt)
  - [ ] 1.2 Registration endpoint
  - [ ] 1.3 Login endpoint update
  - [ ] 1.4 JWT claims update
  - [ ] 1.5 RBAC middleware
  - [ ] 1.6 Refresh tokens (optional)
- [ ] Task 2 — Onboarding API
  - [ ] 2.1 Status endpoint
  - [ ] 2.2 Org details
  - [ ] 2.3 Node endpoint
  - [ ] 2.4 Schema map upload
  - [ ] 2.5 API key generation
  - [ ] 2.6 Connectivity test
  - [ ] 2.7 Complete onboarding
- [ ] Task 3 — Org Management & Team APIs
  - [ ] 3.1 Org profile
  - [ ] 3.2 Team management
  - [ ] 3.3 Invitation acceptance
  - [ ] 3.4 API key management
  - [ ] 3.5 Privacy budget data
  - [ ] 3.6 Org settings
- [ ] Task 4 — Admin Panel API
- [ ] Task 5 — Landing & Auth Pages (Frontend)
- [ ] Task 6 — Onboarding Wizard (Frontend)
- [ ] Task 7 — Updated Dashboard (Frontend)
- [ ] Task 8 — Seed Data & Bootstrap
- [ ] Task 9 — Email Notifications (simulated)
- [ ] Task 10 — Multi-Tenancy Safety
- [ ] Task 11 — Password Reset Flow
- [ ] Task 12 — Docker & Environment Updates
