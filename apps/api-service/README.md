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
- `POST /auth/logout`
- `GET /me`
