# Securum

Securum is a self-hosted, multi-organization analytics platform. It lets several organizations answer aggregate queries together (COUNT, SUM, AVG, GROUP BY) without sharing raw data. Each org runs its own org-node next to its Postgres database; the central coordinator runs a commit-reveal protocol and aggregates the noisy results.

This repo is a monorepo with a coordinator API, org-node service, shared library, and a React dashboard. A Docker Compose stack spins up a full dev environment with three orgs and seeded data.

## How a query flows

1. An analyst submits a query via the dashboard.
2. The coordinator validates the query against the schema map, and broadcasts it to org-nodes.
3. Each org-node computes a local aggregate, adds Laplace noise, and commits a hash.
4. In the reveal phase, org-nodes send the noisy result and nonce; the coordinator verifies commitments and aggregates the results.

## Services and ports (dev)

- Coordinator API: http://localhost:4000
- Dashboard UI: http://localhost:3000
- Org nodes: http://localhost:5001, http://localhost:5002, http://localhost:5003
- Postgres (coordinator): localhost:5432

## Quickstart (Docker)

Prereqs:
- Docker Desktop
- Node.js (only needed for running scripts locally)

Run the full stack:

```bash
npm run dev
```

Or, directly:

```bash
docker compose -f docker/docker-compose.yml up --build
```

Health check:

```bash
curl http://localhost:4000/health
```

Default platform admin (seeded):
- Email: admin@securum.dev
- Password: admin123

Note: Postgres init scripts run only on first volume creation. If you change the SQL and need a clean slate:

```bash
docker compose -f docker/docker-compose.yml down -v
```

## Local dev (without Docker)

Install dependencies once at the repo root:

```bash
npm install
```

Build shared types first (other packages depend on it):

```bash
npm run build -w @securum/shared
```

Start each service with the required env vars. The Docker Compose file shows working values for dev.

Coordinator:

```bash
npm run dev -w @securum/coordinator
```

Org node:

```bash
npm run dev -w @securum/org-node
```

Dashboard:

```bash
npm run dev -w @securum/dashboard
```

## Configuration

Coordinator env vars:

- PORT (default 4000)
- DATABASE_URL (required)
- JWT_SECRET (required)
- QUORUM_MIN (default 2)
- DEFAULT_EPSILON (default 1.0)
- MAX_EPSILON_PER_ORG (default 10.0)
- ADMIN_EMAIL / ADMIN_PASSWORD (optional overrides for seeded admin)
- ANALYST_USER / ANALYST_PASSWORD (legacy dev login)

Org-node env vars:

- PORT (default 5001)
- DATABASE_URL (required)
- COORDINATOR_URL (required)
- ORG_NAME (required)
- SCHEMA_MAP_PATH (required, see packages/org-node/config)
- DEFAULT_EPSILON (default 1.0)
- SUM_SENSITIVITY (default 500)

Dashboard env vars:

- VITE_API_URL (e.g. http://localhost:4000)

## Scripts

- npm run dev - Docker Compose stack (coordinator, org-nodes, dashboard, Postgres)
- npm run build - build shared only
- npm run build:all - build shared, coordinator, and org-node
- npm run clean - remove dist folders and node_modules from packages

## Tests

Unit tests:

```bash
npm run test -w @securum/shared
npm run test -w @securum/org-node
```

End-to-end (requires running stack):

```bash
bash test-phase6.sh
```

## Repo layout

```
packages/
	coordinator/   Express API (auth, orgs, queries, admin)
	org-node/      Per-org service that runs queries locally
	shared/        Types, validation, DP helpers, query rewriting
	dashboard/     React + Vite UI
docker/
	docker-compose.yml
	coordinator.Dockerfile
	org-node.Dockerfile
	dashboard.Dockerfile
	postgres-init/  Coordinator schema + migrations
	dev-seed/       Seed data for org databases
```

## Docs

- PLAN.md - Implementation roadmap, threat model, and design notes
- phase0.md ... phase6.md - Milestone notes per phase
- New-features.md - Additions and changes by phase

## What this is (and is not)

Securum is a practical demo of privacy-preserving, multi-org aggregation. It avoids raw data sharing and enforces a privacy budget, but it is not a production-grade MPC system. The coordinator is trusted-but-curious; if you need stronger guarantees, you would layer in secret sharing or homomorphic encryption.
