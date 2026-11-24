# Production image for the backend API.
#
# Static assets are NOT served by the Node.js/Express app in production
# (see issue #1032). They are served by a CDN or nginx in front of this
# container, so this image only needs to run the API server.
#
# Build from the repository root so the workspace lockfile is available:
#   docker build -f apps/backend/Dockerfile -t scoopdope-backend .

# Pin the base image to a specific Node 20 minor release instead of the
# floating node:20-alpine tag, so rebuilds are reproducible and a new
# upstream minor cannot change the runtime without review.
ARG NODE_VERSION=20.18

# ---------------------------------------------------------------------------
# Stage 1: production dependencies only.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps

WORKDIR /app

# Only the manifest/lock files are copied here so this layer is cached until
# dependencies actually change.
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/types/package.json ./packages/types/

# Install production dependencies (no devDependencies) for the backend
# workspace. These are the only node_modules that reach the final image.
RUN npm ci --omit=dev --workspace=apps/backend

# ---------------------------------------------------------------------------
# Stage 2: compile the TypeScript application.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/types/package.json ./packages/types/

# The build needs devDependencies (Nest CLI, TypeScript), so install the full
# workspace dependency set in this throwaway stage.
RUN npm ci --workspace=apps/backend

COPY apps/backend ./apps/backend
COPY packages/types ./packages/types

RUN npm run build --workspace=apps/backend

# ---------------------------------------------------------------------------
# Stage 3: minimal runtime image.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Bring across only the production node_modules and the backend workspace
# manifests from the deps stage - no devDependencies, no test tooling.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps

# Copy the compiled output. Ownership is handed to the unprivileged "node"
# user that node:alpine ships with (uid/gid 1000), so the app never runs as
# root and cannot write to its own source tree at runtime.
COPY --from=builder --chown=node:node /app/apps/backend/dist ./apps/backend/dist

USER node

# Assets are handled by the CDN/nginx reverse proxy; expose only the API port.
EXPOSE 3000

# Liveness check used by Docker, Compose and orchestrators. /health is the
# backend's full health endpoint (database, Redis, Stellar) and returns 200
# only when the API is ready to serve traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/backend/dist/main.js"]
