# Yishan API Service

API service built with Hono + Bun, deployed to both Cloudflare Workers and a remote Bun service.

## Stack

- Runtime: Bun and Cloudflare Workers
- Router/API: Hono
- Database: Neon Postgres
- ORM: Drizzle ORM
- Auth: Google OAuth + GitHub OAuth

## Environment Variables

Copy `.env.example` to `.env` (Bun) and `.dev.vars` (Wrangler local dev):

- `DATABASE_URL`
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
- `bun run check` - typecheck
- `bun run db:generate` - generate Drizzle migrations
- `bun run db:push` - push schema directly to database
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
- Org-scoped resources reject access when the authenticated user is not a member of that org.
