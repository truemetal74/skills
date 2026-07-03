#!/bin/sh
# Generates the runtime config the SPA reads via window.ENV_CONFIG.
# Runs on every container start, so env-var changes need no rebuild.

echo "=== Docker entrypoint starting ==="
echo "VITE_API_URL=${VITE_API_URL}"

# --- PROJECT CONFIG: list every VITE_* variable the app's config loader reads ---
cat > /usr/share/nginx/html/config.js <<EOF
window.ENV_CONFIG = {
  VITE_API_URL: '${VITE_API_URL:-http://localhost:8080}',
  VITE_DEBUG: '${VITE_DEBUG:-false}'
};
EOF
# --------------------------------------------------------------------------------

echo "Generated config.js:"
cat /usr/share/nginx/html/config.js
echo "=== Starting Nginx ==="

exec nginx -g 'daemon off;'
