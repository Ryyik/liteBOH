#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${1:-dist}"
MAX_TOTAL_MB="${MAX_TOTAL_MB:-30}"
MAX_SINGLE_JS_KB="${MAX_SINGLE_JS_KB:-800}"

if [ ! -d "$DIST_DIR" ]; then
  echo "[bundle-check] Missing dist directory: $DIST_DIR"
  exit 1
fi

TOTAL_KB=$(du -sk "$DIST_DIR" | awk '{print $1}')
MAX_TOTAL_KB=$((MAX_TOTAL_MB * 1024))

if [ "$TOTAL_KB" -gt "$MAX_TOTAL_KB" ]; then
  echo "[bundle-check] FAIL: dist size ${TOTAL_KB}KB exceeds ${MAX_TOTAL_KB}KB (${MAX_TOTAL_MB}MB)."
  exit 1
fi

MAX_JS_KB=$(find "$DIST_DIR" -type f -name '*.js' -exec du -k {} + 2>/dev/null | awk 'BEGIN{m=0} {if ($1>m) m=$1} END{print m+0}')

if [ "$MAX_JS_KB" -gt "$MAX_SINGLE_JS_KB" ]; then
  echo "[bundle-check] FAIL: largest JS chunk ${MAX_JS_KB}KB exceeds ${MAX_SINGLE_JS_KB}KB."
  exit 1
fi

echo "[bundle-check] PASS: dist=${TOTAL_KB}KB, largest-js=${MAX_JS_KB}KB"
