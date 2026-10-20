# Production image for the backend API.
#
# Static assets are NOT served by the Node.js/Express app in production
# (see issue #1032). They are served by a CDN or nginx in front of this
# container, so this image only needs to run the API server.

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies (production only)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Run the app as a non-root user (issue #1027).
# The node:20-alpine image already ships an unprivileged "node" user/group
# (uid/gid 1000), so reuse it instead of creating a new one. Hand ownership
# of the app directory to that user so it can read the source and write any
# runtime files it needs.
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production

# The Express app must not serve static files in production; assets are
# handled by the CDN/nginx reverse proxy. Expose only the API port.
EXPOSE 3000

CMD ["node", "dist/index.js"]
