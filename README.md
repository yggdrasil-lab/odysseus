# odysseus

Self-hosted local-first travel planning stack (40-Leisure).

## Architecture & Planning Docs

Canonical specification and ticket breakdown live in the Obsidian Vault:
- `second-brain/Efforts/Travel Planner/Spec - Odysseus.md`
- `second-brain/Efforts/Travel Planner/Tickets - Odysseus.md`

## Services

- `odysseus-db`: PostgreSQL 16 (`postgres:16-alpine`) backed by `${ODYSSEUS_DB_MOUNT_PATH}` (`/opt/odysseus/data`).
- `odysseus-api`: FastAPI + Alembic + SQLAlchemy service on port `8000`, caching offline mappacks in `${ODYSSEUS_MAPPACKS_MOUNT_PATH}` (`/opt/odysseus/mappacks`).
- `odysseus-web`: React + Vite PWA served by `nginx:1.27-alpine` on port `8080`.

## One-Time Provisioning Checklist

1. **GitHub Repository Secrets** (`yggdrasil-lab/odysseus` settings; org secrets/vars `REGISTRY_USERNAME`, `REGISTRY_RAW_PASSWORD`, `DOMAIN_NAME`, `REGISTRY_PREFIX` are inherited):
   - `ODYSSEUS_DB_PASSWORD`
   - `ODYSSEUS_MCP_TOKEN`
   - `ODYSSEUS_INTEGRATION_TOKEN`
   - `IMMICH_API_KEY`
2. **Cloudflare DNS**: Add proxied `odysseus.<domain>` record pointing to Gaia ingress.
3. **Authentik SSO**: Create the `odysseus` Proxy Provider + Application in Authentik, bind it to the Embedded Outpost, and refresh bindings via `docker service update --force cerberus_authentik-server`.
4. **Charon Backups (Post-Deploy)**: Register `odysseus-db` in `Forge/charon` so Postgres backups include the Odysseus database.
