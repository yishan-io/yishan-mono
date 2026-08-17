# Desktop App Agent Instructions

**Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) before changing Renderer code. It is the mandatory ownership contract.**

## Mandatory Rules

1. Do not skip the Renderer layer contract. UI → Commands → State → domain helpers.
   Handlers → Services → DB. Command handlers stay thin.
2. Do not import another Feature's internal State, Runtime, Event handler, or
   Store. Use its public API (`index.ts`), Selectors, or Commands.
3. Feature UI must not import `api/`, `rpc/`, `electron`, or main-process code.
   Feature Commands call Ports; transport stays behind `api/` and `rpc/`.
4. `model/` files contain pure data and rules only. No React, Zustand, Electron,
   transport, Runtime, or State imports.
5. `state/` files own Zustand State, Selectors, and synchronous mutations. They
   may import Zustand and their own Feature's Model. Do not add business logic
   or side effects to State actions.
6. Keep component files under 300 lines and other files under 500 lines.
7. Do not create `utils`, `common`, `shared`, or `services` buckets in the
   Renderer. Shared UI lives in `ui/`; shared technical functions stay domain-free.
8. Cross-Feature workflows belong in `app/commands` or `app/flows`, not in a Feature.
9. Do not add allowlist rows to `architecture.knownViolations.ts` for completed
   phases. Remove a row in the same change that fixes its violation.
10. Preserve visible behavior unless a task explicitly changes it. Add
    characterization tests before behavior moves.

## Verify

```bash
cd apps/desktop
bunx vitest run src/renderer/architecture.test.ts   # dependency rules
bun run check                                       # tsc
bunx biome check src/renderer/architecture.test.ts src/renderer/architecture.knownViolations.ts
```
