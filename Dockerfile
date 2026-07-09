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
RUN npm prune --omit=dev

# ---- Runner ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000 \
    MEDIA_DIR=/media \
    DB_PATH=/data/data.db \
    THUMBNAIL_DIR=/data/thumbnails

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data /media

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Inline entrypoint: fix volume ownership then start node directly as root.
RUN printf '#!/bin/sh\nset -e\nchown -R 0:0 /data /media 2>/dev/null || true\nexec "$@"\n' > /entrypoint.sh \
    && chmod +x /entrypoint.sh

VOLUME ["/media", "/data"]

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:5000/api/stats').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "dist/index.cjs"]
