# yishan monorepo

## What this project is

A cross-platform desktop workspace tool for engineers. The monorepo contains:

- `apps/desktop` — Electron app (TypeScript, React, MUI, Zustand)
- `apps/api-service` — REST API (TypeScript, Hono, Drizzle, Cloudflare Workers)
- `apps/cli` — Daemon CLI (Go, Cobra)
- `apps/relay` — WebSocket relay server (Go)
- `apps/landing` — Marketing page (Next.js)
- `packages/design-tokens` — Shared MUI + React Native theme tokens
- `packages/core` — Shared cross-app types (in progress)

## Coding guide

**`docs/coding-guide.md` is the law. Read relevant sections before writing any code.**

Key rules that agents break most often:

1. Do not skip the layer contract. Views → commands → store actions → domain helpers.
   Handlers → services → db. CLI cmd → internal packages.
2. Use `getErrorMessage(error)` from `helpers/errorHelpers.ts`. Never inline
   `error instanceof Error ? error.message : String(error)`.
3. Use `generateId()` from `helpers/generateId.ts`. Never inline `crypto.randomUUID()`.
4. Use `nonEmptyStringSchema` from `validation/common.ts`. Never copy
   `z.object({ orgId: nonEmptyStringSchema })` — compose with `.extend()`.
5. Use `assertOrganizationMember` from `services/shared/`. Never copy the
   membership-check query into a service method.
6. No file over 500 lines. No React component over 300 lines. No Go function over 40 lines.
7. All errors thrown from services must be typed `AppError` subclasses. No raw
   `throw new Error("string")` from service code.
8. In Go: always `%w` not `%s` when wrapping errors. Always pass `context.Context`.
   Every goroutine must have an exit condition.

## Build and test commands

```bash
# TypeScript (run from repo root or app dir)
bun run typecheck     # tsc --noEmit
bun run lint          # biome check
bun run test          # vitest run

# Go (run from apps/cli or apps/relay)
go build ./...
go test ./...
go vet ./...
```

## Pending refactor work

See `.my-context/refactor-plan.md` for the full list of tracked improvements.
Check it before starting structural work — the item may already be planned or completed.
