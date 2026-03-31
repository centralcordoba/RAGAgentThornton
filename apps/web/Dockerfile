# =============================================================================
# RegWatch AI — Web Dockerfile (multi-stage)
# =============================================================================

# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat curl

# ---------------------------------------------------------------------------
# Dependencies (workspaces hoisted to root)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=@regwatch/web --workspace=@regwatch/shared

# ---------------------------------------------------------------------------
# Builder: Next.js build with NEXT_PUBLIC_* vars injected at build time
# ---------------------------------------------------------------------------
FROM base AS builder

ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ARG NEXT_PUBLIC_DEV_TOKEN=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_DEV_TOKEN=${NEXT_PUBLIC_DEV_TOKEN}

COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npx next build

# ---------------------------------------------------------------------------
# Development: hot-reload with volumes
# ---------------------------------------------------------------------------
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
WORKDIR /app/apps/web
CMD ["npx", "next", "dev", "--port", "3001"]

# ---------------------------------------------------------------------------
# Production: standalone output + guaranteed node_modules
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl && \
    addgroup --system --gid 1001 regwatch && \
    adduser --system --uid 1001 regwatch

# Copy standalone output
COPY --from=builder --chown=regwatch:regwatch /app/apps/web/.next/standalone ./
# Copy public assets and static files
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=regwatch:regwatch /app/apps/web/.next/static ./.next/static
# Ensure node_modules exist (standalone tracing misses deps in monorepo hoisted setup)
COPY --from=deps --chown=regwatch:regwatch /app/node_modules ./node_modules

USER regwatch
EXPOSE 3001
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/ || exit 1

CMD ["node", "server.js"]
