# Yishan API Service

API service built with Hono + Bun, deployed to both Cloudflare Workers and a remote Bun service.

## Stack

- Runtime: Bun and Cloudflare Workers
- Router/API: Hono
- Database: Postgres via Cloudflare Hyperdrive + node-postgres
- ORM: Drizzle ORM
- Auth: Google OAuth + GitHub OAuth

## Environment Variables

Copy `.env.example` to `.env` (Bun) and `.dev.vars` (Wrangler local dev):

- `DATABASE_URL` (Bun runtime and Drizzle CLI; defaults to local Postgres in examples. Workers prefer the `HYPERDRIVE` binding when present)
- `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (optional override for Wrangler local Hyperdrive emulation)
- `APP_BASE_URL`
- `SESSION_SECRET`
- `SESSION_TTL_DAYS` (default `30`)
- `JWT_ACCESS_SECRET`
- `JWT_ACCESS_TTL_SECONDS` (default `900`)
- `REFRESH_TOKEN_TTL_DAYS` (default `30`)
- `JWT_ISSUER` (optional, defaults to `APP_BASE_URL`)
- `JWT_AUDIENCE` (optional, defaults to `api-service`)
- `COOKIE_DOMAIN` (optional)
- `CORS_ORIGINS` (optional, comma-separated origins)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

## Scripts

- `bun run dev:bun` - run the remote service locally via Bun
- `bun run dev:worker` - run the Cloudflare Worker locally with Wrangler
- `bun run db:local` - start the local Postgres database used by Wrangler Hyperdrive emulation
- `bun run check` - typecheck
- `bun run db:generate` - generate Drizzle migrations
- `bun run db:migrate` - apply committed SQL migrations to target database
- `bun run deploy:worker` - deploy to Cloudflare Workers

## Routes

- `GET /health`
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/github`
- `GET /auth/github/callback`
- `POST /auth/token`
- `POST /auth/refresh`
- `POST /auth/revoke`
- `POST /auth/logout`
- `GET /me`
- `GET /orgs`
- `POST /orgs`
- `DELETE /orgs/:orgId`
- `POST /orgs/:orgId/members`
- `DELETE /orgs/:orgId/members/:userId`
- `GET /orgs/:orgId/nodes`
- `POST /orgs/:orgId/nodes`
- `DELETE /orgs/:orgId/nodes/:nodeId`

Notes:

- OAuth login only accepts provider accounts with verified email addresses.
- Account resolution order is: provider account link first, then local user by email.
- `GET /auth/:provider` supports `mode=cli&redirect_uri=http://127.0.0.1:<port>/callback&state=<random>` and redirects back with API tokens for CLI login flows.
- `POST /orgs` accepts `{ "name": string, "memberUserIds"?: string[] }` and always includes the authenticated user as an `owner` member.
- `DELETE /orgs/:orgId` is owner-only and removes the org with cascading memberships.
- `POST /orgs/:orgId/members` accepts `{ "userId": string, "role"?: "member" | "admin" }` and is allowed for org owners/admins.
- `DELETE /orgs/:orgId/members/:userId` is allowed for org owners/admins, but owner members cannot be removed.
- `POST /orgs/:orgId/nodes` accepts `{ "name": string, "scope": "local" | "remote", "endpoint"?: string, "metadata"?: { "os"?: string, "version"?: string, ... } }`.
- Local nodes are user-owned (`organizationId = null`) even when created in org context; remote nodes are org-shared by default.
- `GET /orgs/:orgId/nodes` returns both org remote nodes and local nodes owned by org members; listing visibility does not imply usage permission (`canUse` indicates direct usability).
- `POST /orgs/:orgId/projects/:projectId/workspaces` creates workspace records via API first; node provisioning is handled as a backend orchestration concern.
- Org-scoped resources reject access when the authenticated user is not a member of that org.

## Local Hyperdrive

`wrangler dev` requires a local Postgres database for the `HYPERDRIVE` binding. Start the matching database before running the worker:

```sh
bun run db:local
bun run db:migrate
bun run dev:worker
```

## Production Deployment (Cloudflare Workers + Neon)

### Prerequisites

- [Neon](https://neon.tech) project with a Postgres database
- Cloudflare account with Workers plan
- `wrangler` CLI authenticated (`wrangler login`)

### 1. Neon Database

Create a Neon project and copy the connection string (pooled endpoint recommended). The format is:

```
postgres://<user>:<password>@<endpoint>.neon.tech/<dbname>?sslmode=require
```

### 2. Apply Schema to Neon

Run Drizzle against the Neon database to set up or update the schema:

```sh
DATABASE_URL="postgres://<user>:<password>@<endpoint>.neon.tech/<dbname>?sslmode=require" bun run db:migrate
```

`drizzle-kit migrate` applies pending SQL files in `drizzle/` using `drizzle/meta/_journal.json`.

### 3. Create Cloudflare Hyperdrive

Hyperdrive provides connection pooling and latency reduction between the Worker and Neon:

```sh
wrangler hyperdrive create yishan-db \
  --connection-string="postgres://<user>:<password>@<endpoint>.neon.tech/<dbname>?sslmode=require"
```

Copy the returned Hyperdrive config ID and update the `[[hyperdrive]]` section in `wrangler.toml`:

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "<your-hyperdrive-config-id>"
```

### 4. Set Worker Secrets

Secrets are stored encrypted in Cloudflare and injected at runtime. Set each required secret:

```sh
wrangler secret put SESSION_SECRET
wrangler secret put JWT_ACCESS_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

Each command prompts for the value interactively.

### 5. Configure Environment Variables

Non-secret variables are defined in the `[vars]` section of `wrangler.toml`. Update the production values:

| Variable | Description |
|---|---|
| `APP_BASE_URL` | Public URL of the deployed Worker (e.g. `https://api.yishan.io`) |
| `SESSION_TTL_DAYS` | Session lifetime in days (default `30`) |
| `JWT_ACCESS_TTL_SECONDS` | Access token lifetime in seconds (default `900`) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime in days (default `30`) |
| `JWT_ISSUER` | JWT issuer claim (should match `APP_BASE_URL`) |
| `JWT_AUDIENCE` | JWT audience claim (default `api-service`) |
| `COOKIE_DOMAIN` | Domain for auth cookies (e.g. `yishan.io`) |
| `CORS_ORIGINS` | Comma-separated allowed origins |

### 6. Deploy

```sh
bun run deploy:worker
```

This runs `wrangler deploy`, which bundles `src/worker.ts` and publishes the Worker.

### 7. Verify

After deployment, confirm the Worker is healthy and can reach the database:

```sh
curl https://api.yishan.io/health
```

A successful response confirms the Worker is running. Test a database-backed endpoint (e.g. an authenticated request) to verify Hyperdrive connectivity.

### Updating the Schema

When the Drizzle schema changes:

1. Generate a migration: `bun run db:generate`
2. Apply to Neon: `DATABASE_URL="<neon-connection-string>" bun run db:migrate`
3. Redeploy if the Worker code also changed: `bun run deploy:worker`

### CI/CD Pipeline

Pushes to `main` that change files under `apps/api-service/` automatically trigger the **Deploy API Service** workflow (`.github/workflows/deploy-api-service.yml`). The pipeline runs typecheck and tests before deploying. It can also be triggered manually via `workflow_dispatch`.

Required GitHub repository secret:

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with **Workers Scripts:Edit** permission. Create one at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).
- `NEON_DATABASE_URL` — Neon Postgres connection string used by the CI migration step (`bun run db:migrate`).

### Cron Schedule

The Worker runs a daily cleanup job at 03:00 UTC (`0 3 * * *`) to remove expired sessions and revoked refresh tokens. This is configured in `wrangler.toml` under `[triggers]`.
