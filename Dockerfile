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
# Slim node image (build tooling is not needed at runtime).
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4701 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# npm/corepack are build-time only and not needed by `node server.js`.
# Set up the data directory (SQLite DB + snapshots + logos) — mounted as a
# volume.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    && mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4701

# Healthcheck using node's built-in fetch (slim image has no curl).
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:4701/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
