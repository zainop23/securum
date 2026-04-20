/* ===================================================================
   Phase 6 Seed Data — Platform Admin + Demo Org
   =================================================================== */

/* ── Platform Admin ──
   Email: admin@securum.dev
   Password: admin123
   bcrypt hash generated with 12 salt rounds */
INSERT INTO users (id, email, password_hash, full_name, role, is_active)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'admin@securum.dev',
    '$2b$12$qmN6yQMMNtLRo5xr814GxutcSq5.w3O9EcWfkRd.cYCG/sS7.g7Ti',
    'Platform Admin',
    'platform_admin',
    true
) ON CONFLICT (email) DO NOTHING;
