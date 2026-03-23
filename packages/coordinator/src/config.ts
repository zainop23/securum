interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  quorumMin: number;
  defaultEpsilon: number;
  maxEpsilonPerOrg: number;
  analystUser: string;
  analystPassword: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} env var is required`);
  }
  return value;
}

function parseNumberEnv(name: string, rawValue: string, fallback: number): number {
  const parsed = Number(rawValue || fallback);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number`);
  }
  return parsed;
}

export const config: AppConfig = {
  port: parseNumberEnv('PORT', process.env.PORT || '', 4000),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  quorumMin: parseNumberEnv('QUORUM_MIN', process.env.QUORUM_MIN || '', 2),
  defaultEpsilon: parseNumberEnv('DEFAULT_EPSILON', process.env.DEFAULT_EPSILON || '', 1.0),
  maxEpsilonPerOrg: parseNumberEnv('MAX_EPSILON_PER_ORG', process.env.MAX_EPSILON_PER_ORG || '', 10.0),
  analystUser: requireEnv('ANALYST_USER'),
  analystPassword: requireEnv('ANALYST_PASSWORD'),
};

if (!Number.isInteger(config.port) || config.port <= 0) {
  throw new Error('PORT must be a positive integer');
}

if (!Number.isInteger(config.quorumMin) || config.quorumMin <= 0) {
  throw new Error('QUORUM_MIN must be a positive integer');
}

if (!(config.defaultEpsilon > 0)) {
  throw new Error('DEFAULT_EPSILON must be > 0');
}

if (!(config.maxEpsilonPerOrg > 0)) {
  throw new Error('MAX_EPSILON_PER_ORG must be > 0');
}
