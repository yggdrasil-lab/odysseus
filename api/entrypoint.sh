#!/bin/sh
set -e

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

load_secret_env() {
    var_name="$1"
    file_path="$2"
    if [ -z "$file_path" ]; then
        return 0
    fi
    if [ ! -f "$file_path" ]; then
        echo "ERROR: secret file not found: ${file_path}" >&2
        exit 1
    fi
    secret_val=$(tr -d '\r\n' < "$file_path")
    if [ -z "$secret_val" ]; then
        echo "ERROR: secret file is empty: ${file_path}" >&2
        exit 1
    fi
    export "${var_name}=${secret_val}"
}

load_secret_env "ODYSSEUS_DB_PASSWORD" "${ODYSSEUS_DB_PASSWORD_FILE:-}"
load_secret_env "ODYSSEUS_MCP_TOKEN" "${ODYSSEUS_MCP_TOKEN_FILE:-}"
load_secret_env "ODYSSEUS_INTEGRATION_TOKEN" "${ODYSSEUS_INTEGRATION_TOKEN_FILE:-}"
load_secret_env "IMMICH_API_KEY" "${IMMICH_API_KEY_FILE:-}"

if [ -z "${ODYSSEUS_DATABASE_URL:-}" ] && [ -n "${ODYSSEUS_DB_PASSWORD:-}" ]; then
    ODYSSEUS_DATABASE_URL=$(python -c 'from app.config import settings; print(settings.database_url)')
    export ODYSSEUS_DATABASE_URL
fi

attempt=1
until alembic upgrade head; do
    if [ "$attempt" -ge 30 ]; then
        echo "ERROR: database not reachable after ${attempt} attempts" >&2
        exit 1
    fi
    echo "waiting for database (attempt ${attempt})"
    attempt=$((attempt + 1))
    sleep 2
done

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
