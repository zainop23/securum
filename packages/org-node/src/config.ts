interface OrgNodeConfig {
  port: number;
  databaseUrl: string;
  coordinatorUrl: string;
  orgName: string;
  schemaMapPath: string;
  defaultEpsilon: number;
  sumSensitivity: number;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

function parsePositiveNumber(name: string, raw: string, fallback: number): number {
  const n = Number(raw || fallback);
  if (!Number.isFinite(n) || !(n > 0)) {
    throw new Error(`${name} must be a positive number`);
  }
  return n;
}

export const config: OrgNodeConfig = {
  port: parsePositiveNumber('PORT', process.env.PORT || '', 5001),
  databaseUrl: requireEnv('DATABASE_URL'),
  coordinatorUrl: requireEnv('COORDINATOR_URL'),
  orgName: requireEnv('ORG_NAME'),
  schemaMapPath: requireEnv('SCHEMA_MAP_PATH'),
  defaultEpsilon: parsePositiveNumber(
    'DEFAULT_EPSILON',
    process.env.DEFAULT_EPSILON || '',
    1.0
  ),
  sumSensitivity: parsePositiveNumber(
    'SUM_SENSITIVITY',
    process.env.SUM_SENSITIVITY || '',
    500
  ),
};
