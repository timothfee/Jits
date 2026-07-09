#!/bin/sh
set -e

# Fix ownership of mounted volumes so uid 1001 (app) can write to them.
# This runs as root before we drop privileges.
chown -R 1001:1001 /data /media 2>/dev/null || true

# Drop to non-root app user and exec the real process.
exec su-exec app "$@"
