# Yishan Desktop

Electron + React desktop app scaffold aligned to legacy layout:

- `src/main` for Electron main/preload process
- `src/renderer` as Vite renderer root
- `dist/electron` for bundled Electron entrypoints
- `dist/renderer` for renderer production output

## Scripts

- `bun run dev` runs HMR + watched Electron bundles.
- `bun run build` builds renderer and Electron bundles.
- `bun run build:app` builds and packages desktop installers.
- `bun run start` builds and runs the packaged Electron entrypoint.
- `bun run check` runs TypeScript type checking.
