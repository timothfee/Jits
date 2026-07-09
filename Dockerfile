# ---- Builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# native build tools for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
# Drop devDependencies so we can copy a production-only node_modules to the runner.
RUN npm prune --omit=dev

# ---- Runner ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000 \
    MEDIA_DIR=/media \
    DB_PATH=/data/data.db \
    THUMBNAIL_DIR=/data/thumbnails

# ffmpeg (thumbnail generation), tini (PID 1 signal handling / graceful
# shutdown), ca-certificates (HTTPS for optional remote-thumbnail fetch).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user (the app never needs root).
RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /data /media \
    && chown -R app:app /app /data /media

COPY --from=builder --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist

USER app

# /media is bind-mounted read-only at runtime; /data holds the DB + thumbnails.
VOLUME ["/media", "/data"]

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:5000/api/stats').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.cjs"]
