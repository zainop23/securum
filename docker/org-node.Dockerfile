FROM node:20-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/coordinator/package.json packages/coordinator/package.json
COPY packages/org-node/package.json packages/org-node/package.json
COPY packages/dashboard/package.json packages/dashboard/package.json
RUN npm install
COPY packages/shared packages/shared
COPY packages/org-node packages/org-node
RUN npm run build -w @securum/shared
RUN npm run build -w @securum/org-node
CMD ["node", "packages/org-node/dist/index.js"]
