# ── Stage 1: install production dependencies ──────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# git is required by some transitive deps (e.g. baileys, instagram-private-api)
RUN apk add --no-cache git

# Copy manifests first so Docker layer-caches the install step
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts

# ── Stage 2: production image ──────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user and writable runtime directories before switching users
RUN addgroup -S messagent && adduser -S messagent -G messagent \
    && mkdir -p .wa-sessions \
    && chown -R messagent:messagent /app

USER messagent

# Copy installed modules from the deps stage
COPY --from=deps --chown=messagent:messagent /app/node_modules ./node_modules

# Copy source — only what the server needs at runtime
COPY --chown=messagent:messagent src/ ./src/
COPY --chown=messagent:messagent package.json ./

# The port the Fastify server listens on (overridden by the PORT env var at runtime)
EXPOSE 4000

# Healthcheck so orchestrators know when the container is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-4000}/health || exit 1

CMD ["node", "src/index.js"]
