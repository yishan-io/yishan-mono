# Yishan API Service

API service built with Hono + Bun, deployed to both Cloudflare Workers and a remote Bun service.

## Stack

- Runtime: Bun and Cloudflare Workers
- Router/API: Hono
- Database: Postgres via Cloudflare Hyperdrive + node-postgres
- ORM: Drizzle ORM
- Auth: Google OAuth + GitHub OAuth
- Queue: Upstash QStash → Relay service → Daemon (WebSocket push)

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
- `QSTASH_URL` (Upstash QStash base URL, defaults to `https://qstash-us-east-1.upstash.io`)
- `QSTASH_TOKEN` (Upstash QStash bearer token for dispatching scheduled job runs)
- `RELAY_URL` (URL of the relay service, e.g. `https://relay.yishan.io`)
- `RELAY_API_TOKEN` (bearer token for authenticating with the relay's dispatch endpoint)

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
- `GET /orgs/:orgId/scheduled-jobs?projectId=<optional>`
- `POST /orgs/:orgId/scheduled-jobs`
- `PUT /orgs/:orgId/scheduled-jobs/:jobId`
- `PUT /orgs/:orgId/scheduled-jobs/:jobId/pause`
- `PUT /orgs/:orgId/scheduled-jobs/:jobId/resume`
- `PUT /orgs/:orgId/scheduled-jobs/:jobId/disable`
- `GET /orgs/:orgId/scheduled-jobs/:jobId/runs?limit=20`

Notes:

- OAuth login only accepts provider accounts with verified email addresses.
- Account resolution order is: provider account link first, then local user by email.
- `GET /auth/:provider` supports `mode=cli&redirect_uri=http://127.0.0.1:<port>/callback&state=<random>` and redirects back with API tokens for CLI login flows.
- `POST /orgs` accepts `{ "name": string, "memberUserIds"?: string[] }` and always includes the authenticated user as an `owner` member.
- `DELETE /orgs/:orgId` is owner-only and removes the org with cascading memberships.
- `POST /orgs/:orgId/members` accepts `{ "userId": string, "role"?: "member" | "admin" }` and is allowed for org owners/admins.
- `DELETE /orgs/:orgId/members/:userId` is allowed for org owners/admins, but owner members cannot be removed.
- `POST /nodes/register` accepts `{ "nodeId": string, "name": string, "kind"?: "managed" | "external", "scope": "private" | "shared", "endpoint"?: string, "metadata"?: { "os"?: string, "version"?: string, ... } }`.
- Managed nodes are desktop-managed (`kind = "managed"`) and cannot be unregistered; external nodes (`kind = "external"`) are service-token managed and can be unregistered by permitted users.
- `GET /orgs/:orgId/nodes` returns both shared org nodes and private nodes owned by org members; listing visibility does not imply usage permission (`canUse` indicates direct usability).
- `POST /orgs/:orgId/projects/:projectId/workspaces` creates workspace records via API first; node provisioning is handled as a backend orchestration concern.
- Org-scoped resources reject access when the authenticated user is not a member of that org.

## Scheduled Jobs

Scheduled jobs let you define recurring agent tasks. Each job stores a prompt, optional model and command, and a cron schedule. The API service manages job definitions and run history; the CLI daemon on each node executes agent tasks.

### Architecture

```
CF Worker cron (every 1 min)
  -> evaluator: find due jobs, create "pending" runs, publish via QStash

QStash (at-least-once delivery with automatic retries)
  -> POST {relayURL}/api/v1/dispatch

Relay service (persistent WebSocket to daemon)
  -> sends job.run notification to daemon over WS
  -> daemon responds with job.ack then job.result

Daemon receives job.run from relay:
  -> PUT /runs/start (status -> "running")
  -> exec: opencode run --prompt ... [--model ...] [--command ...]
  -> PUT /runs/complete (status -> "succeeded" or "failed")
  -> sends job.result back to relay

If daemon is offline:
  -> Relay marks run as skipped_offline
  -> After 5 min unclaimed, evaluator marks stale runs as "skipped_offline"
```

- **API service (CF Worker)**: stores job definitions, evaluates due jobs on a 1-minute cron, dispatches via QStash to relay, records run history
- **QStash**: guarantees at-least-once delivery to the relay service with automatic retries
- **Relay service**: maintains persistent WS connections to daemon nodes; pushes `job.run` notifications, handles ack/result lifecycle
- **CLI daemon**: connects outbound to relay via WebSocket, receives `job.run` notifications, executes agent tasks, reports results back to both relay and API
- Each job is bound to a `nodeId` (the daemon that will execute it)

### Run status lifecycle

```
pending -> running -> succeeded
                   -> failed
pending -> skipped_offline  (stale after 5 min, daemon was offline)
```

### Create a scheduled job

`POST /orgs/:orgId/scheduled-jobs`

```json
{
  "name": "Nightly Code Review",
  "projectId": "<project-id>",
  "nodeId": "<daemon-node-id>",
  "agentKind": "claude",
  "prompt": "Review all open PRs and leave comments",
  "model": "claude-sonnet-4-20250514",
  "command": "git diff main..HEAD",
  "cronExpression": "0 2 * * *",
  "timezone": "UTC"
}
```

Fields:
- `name` (required): human-readable label, max 120 chars
- `projectId` (required): which project this job belongs to
- `nodeId` (required): daemon node that will execute the job
- `agentKind` (optional): agent CLI to execute (`opencode`, `codex`, `claude`, `gemini`, `pi`, `copilot`, `cursor`), defaults to `opencode`
- `prompt` (required): agent instruction, max 4096 chars
- `model` (optional): model identifier, max 120 chars
- `command` (optional): CLI command for the agent, max 2048 chars
- `cronExpression` (required): 5-field cron, max 120 chars
- `timezone` (optional): IANA timezone, defaults to UTC

### Daemon endpoints

- `PUT /nodes/:nodeId/scheduled-jobs/runs/start` -- mark run as started
- `PUT /nodes/:nodeId/scheduled-jobs/runs/complete` -- report run result (status, error info)

### Pause/Resume/Disable semantics

- `pause`: keep configuration but stop evaluating until resumed
- `resume`: activate again and recompute `nextRunAt` from current time
- `disable`: permanently stop evaluating without deleting the configuration

### Run visibility and failures

- `GET /orgs/:orgId/scheduled-jobs/:jobId/runs` returns latest runs (default `limit=20`, max `100`)
- Each run includes `status`, `responseBody`, `errorCode`, `errorMessage`, and `errorDetails`
- Job record also keeps latest run summary fields (`lastRunStatus`, `lastErrorCode`, `lastErrorMessage`)

### Schedule format and limits

- Format: **5-field cron** (`minute hour day-of-month month day-of-week`)
- Supported tokens: `*`, comma lists, ranges (`1-5`), step values (`*/5`, `1-30/2`)
- Day-of-week supports `0-6` (`0=Sunday`) and short names (`SUN`..`SAT`)
- Timezone: IANA timezone name (e.g. `UTC`, `America/Los_Angeles`)
- Evaluation: CF Worker cron runs every 1 minute, processes up to 500 due jobs per tick
- Deduplication: scheduled runs are bucketed to the minute and protected by the unique `(jobId, scheduledFor)` index; duplicate evaluator ticks skip publish on insert conflict
- Current hard limits:
  - `name`: 120 chars
  - `prompt`: 4096 chars
  - `model`: 120 chars
  - `command`: 2048 chars
  - `cronExpression`: 120 chars
  - run history query `limit`: 1-100

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
- Upstash QStash account for scheduled job dispatch
- Relay service deployed and accessible

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
wrangler secret put QSTASH_TOKEN
wrangler secret put RELAY_API_TOKEN
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

- `CLOUDFLARE_API_TOKEN` -- a Cloudflare API token with **Workers Scripts:Edit** permission. Create one at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).
- `NEON_DATABASE_URL` -- Neon Postgres connection string used by the CI migration step (`bun run db:migrate`).

### Cron Schedules

The Worker runs two cron triggers configured in `wrangler.toml`:

| Cron | Description |
|---|---|
| `* * * * *` | Evaluates due scheduled jobs every minute, creates pending runs, dispatches via QStash to relay |
| `0 3 * * *` | Daily cleanup at 03:00 UTC -- removes expired sessions, revoked refresh tokens, and marks stale pending runs as `skipped_offline` |
