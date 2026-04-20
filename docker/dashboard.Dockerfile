FROM node:20-alpine

WORKDIR /app

# Copy monorepo root & dashboard package
COPY package.json package-lock.json ./
COPY packages/dashboard/ packages/dashboard/

# Install only dashboard workspace dependencies with bounded network retries.
RUN npm config set fetch-retries 2 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 60000 \
 && npm config set fetch-timeout 120000 \
 && npm ci -w @securum/dashboard --include-workspace-root=false --no-audit --no-fund

WORKDIR /app/packages/dashboard

# Expose Vite dev server port
EXPOSE 3000

# Start Vite dev server on port 3000 with host flag for Docker access
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "3000"]
