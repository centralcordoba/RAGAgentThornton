# =============================================================================
# RegWatch AI — API Dockerfile (multi-stage)
# =============================================================================

# ---------------------------------------------------------------------------
# Base: shared dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat curl

# ---------------------------------------------------------------------------
# Dependencies: install production node_modules only
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/ai-core/package.json packages/ai-core/
RUN npm ci --workspace=@regwatch/api --workspace=@regwatch/shared --workspace=@regwatch/ai-core

# ---------------------------------------------------------------------------
# Development: hot-reload with tsx watch
# ---------------------------------------------------------------------------
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/ai-core/node_modules ./packages/ai-core/node_modules
COPY packages/shared/ packages/shared/
COPY packages/ai-core/ packages/ai-core/
COPY apps/api/ apps/api/
EXPOSE 3000
CMD ["npx", "tsx", "watch", "apps/api/src/server.ts"]

# ---------------------------------------------------------------------------
# Builder: compile TypeScript
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/ai-core/node_modules ./packages/ai-core/node_modules
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/ai-core/ packages/ai-core/
COPY apps/api/ apps/api/
RUN npx tsc --build apps/api/tsconfig.json

# Prune dev dependencies for production image
RUN npm prune --omit=dev --workspace=@regwatch/api --workspace=@regwatch/shared --workspace=@regwatch/ai-core 2>/dev/null || true

# ---------------------------------------------------------------------------
# Production: minimal runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache libc6-compat curl && \
    addgroup --system --gid 1001 regwatch && \
    adduser --system --uid 1001 regwatch

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/ai-core/dist ./packages/ai-core/dist
COPY --from=builder /app/packages/ai-core/package.json ./packages/ai-core/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

USER regwatch
EXPOSE 3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "apps/api/dist/server.js"]
