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
# Dependencies
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=@regwatch/web --workspace=@regwatch/shared

# ---------------------------------------------------------------------------
# Development: Next.js dev server
# ---------------------------------------------------------------------------
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
EXPOSE 3001
CMD ["npx", "next", "dev", "--port", "3001", "apps/web"]

# ---------------------------------------------------------------------------
# Builder: Next.js build with NEXT_PUBLIC_* vars injected at build time
# ---------------------------------------------------------------------------
FROM base AS builder

ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build apps/web

# ---------------------------------------------------------------------------
# Production: standalone output
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl && \
    addgroup --system --gid 1001 regwatch && \
    adduser --system --uid 1001 regwatch

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=regwatch:regwatch /app/apps/web/.next/standalone ./
COPY --from=builder --chown=regwatch:regwatch /app/apps/web/.next/static ./apps/web/.next/static

USER regwatch
EXPOSE 3001
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/ || exit 1

CMD ["node", "apps/web/server.js"]
