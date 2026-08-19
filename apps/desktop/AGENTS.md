# Desktop App Agent Instructions

**Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) before changing Renderer code. It is the mandatory ownership contract.**

## Mandatory Rules

1. Determine ownership before directory or file type.
2. Keep single-Feature UI, Hooks, State, types, and helpers in that Feature.
3. Domain `ui/` is stateless presentation shared by several Features.
4. A Domain can expose an intentional Store. External Consumers can read its
   public State and call public actions, but must not call `setState()` or
   import the Domain's internal `state/` path.
5. Keep Hooks for real React behavior or lifecycle. Do not wrap one Store field
   or action only to create a Hook.
6. Keep Commands only for real business operations. Do not preserve thin
   adapter forwarding or mirror Command contracts.
7. Use `subscriptions/` for asynchronous facts and `runtime/` only for
   long-lived resources with explicit cleanup.
8. Keep transport and DTO mapping in the concrete `daemon/`, `api/`, `host/`,
   or `persistence/` boundary.
9. Other Domains and App import only a Domain's root `index.ts`. Domain code
   must not import its own root index.
10. Use explicit exports. Add a Feature or internal-module `index.ts` only for
    a real cohesive API. Do not add indexes to every directory.
11. Do not create generic `utils`, `helpers`, `common`, `concepts`, `services`,
    or `shared` buckets.
12. Keep component files under 300 lines and other files under 500 lines.
13. Preserve visible behavior unless a task explicitly changes it. Add
    characterization tests before behavior moves.

## Verify

```bash
cd apps/desktop
bunx vitest run src/renderer/architecture.test.ts   # dependency rules
bun run check                                       # tsc
bunx biome check src/renderer/architecture.test.ts src/renderer/architecture.knownViolations.ts
```
