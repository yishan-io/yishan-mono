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

Notes:

- OAuth login only accepts provider accounts with verified email addresses.
- Account resolution order is: provider account link first, then local user by email.
- `POST /orgs` accepts `{ "name": string, "memberUserIds"?: string[] }` and always includes the authenticated user as an `owner` member.
- `DELETE /orgs/:orgId` is owner-only and removes the org with cascading memberships.
