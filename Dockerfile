# ---- Stage 1: install dependencies ----
# Full node image (python3 + build tools) so better-sqlite3 can compile
# its native binding when no prebuilt binary is available.
FROM node:24 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY next.config.ts tsconfig.json postcss.config.mjs ./
COPY src src
RUN npm ci

# ---- Stage 2: build the app (slim, reuses node_modules from deps) ----
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Stage 3: runtime ----
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Data directory (SQLite DB + snapshots) — mounted as a volume.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000

# Healthcheck using node's built-in fetch (slim image has no curl).
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
