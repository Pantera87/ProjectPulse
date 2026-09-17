# ---- Stage 1: install dependencies ----
# Full node image (python3 + build tools) so better-sqlite3 can compile
# its native binding when no prebuilt binary is available.
# PUPPETEER_CACHE_DIR keeps the Chrome download for the runtime stage.
FROM node:24 AS deps
WORKDIR /app
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer
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
# Full node image (not slim): headless Chrome needs system libraries.
FROM node:24 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4701 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    PUPPETEER_CACHE_DIR=/opt/puppeteer

# Shared libraries for headless Chrome (screenshots feature).
# Try trixie package names (t64 suffix) first, fall back to bookworm names.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation \
      libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libcups2t64 \
      libdrm2 libgbm1 libnspr4 libnss3 libpango-1.0-0 \
      libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 \
      libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    || (apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
      libdrm2 libgbm1 libnspr4 libnss3 libpango-1.0-0 \
      libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 \
      libxext6 libxfixes3 libxkbcommon0 libxrandr2) \
    && rm -rf /var/lib/apt/lists/*

# Headless Chrome downloaded by `npm ci` in the deps stage.
COPY --from=deps /opt/puppeteer /opt/puppeteer

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Data directory (SQLite DB + snapshots + screenshots + logos) — mounted as a volume.
RUN mkdir -p /data && chown -R node:node /data /app /opt/puppeteer
USER node
VOLUME ["/data"]
EXPOSE 4701

# Healthcheck using node's built-in fetch (slim image has no curl).
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:4701/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
