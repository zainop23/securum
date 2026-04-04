FROM node:20-alpine

WORKDIR /app

# Copy monorepo root & dashboard package
COPY package.json package-lock.json ./
COPY packages/dashboard/ packages/dashboard/

# Install dependencies
WORKDIR /app/packages/dashboard
RUN npm install

# Expose Vite dev server port
EXPOSE 3000

# Start Vite dev server on port 3000 with host flag for Docker access
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "3000"]
