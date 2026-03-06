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
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

export const config: AppConfig = {
  port: parseInt(process.env.COORDINATOR_PORT || '4000'),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  quorumMin: parseInt(process.env.QUORUM_MIN || '2'),
  defaultEpsilon: parseFloat(process.env.DEFAULT_EPSILON || '1.0'),
  maxEpsilonPerOrg: parseFloat(process.env.MAX_EPSILON_PER_ORG || '10.0'),
  analystUser: requireEnv('ANALYST_USER'),
  analystPassword: requireEnv('ANALYST_PASSWORD'),
};
