# integral-ui

Production code for **Integral** — the v0.1 schema layer and (eventually) the four UX surfaces (Map / Detail / Activity / Shaping).

This is the typed, tested, build-checked re-implementation. The design reference lives in `../ccdesign/` (Babel-in-browser JSX prototype). Design docs live at the project root: `../intent-schema-v0.1.md`, `../intent-ux-sketch-v0.1.md`, `../intents-and-harnesses.md`.

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 8 |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| UI | React 19 |
| Runtime validation | zod 4 — schemas are the source of truth; TS types inferred via `z.infer` |
| Tests | Vitest + React Testing Library + jsdom |
| Path alias | `@/*` → `./src/*` |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build (typecheck + bundle) |
| `npm run typecheck` | Strict TS check, no emit |
| `npm run test` | Vitest watch mode |
| `npm run test:run` | Vitest single run (CI shape) |
| `npm run test:ui` | Vitest UI |
| `npm run test:e2e` | Playwright E2E + visual regression |
| `npm run test:e2e:ui` | Playwright UI |
| `npm run lint` | ESLint |

## Layout

```
src/
  schema/                    zod schemas + inferred TS types — schema-version source of truth
    zod.ts                     all schemas + inferred types
    index.ts                   re-exports
    __tests__/validation.test.ts  fixture acceptance + falsification tests
  fixtures/
    workspace.ts             minimal typed Workspace covering all 4 v0.1 IntentKinds
  test/setup.ts              vitest setup (jest-dom matchers)
  App.tsx                    placeholder — validates fixture at load; replace as surfaces land
  main.tsx                   React root
```

## Schema discipline

- `SCHEMA_VERSION = '0.1.0'`. Every `Intent` / `IntentState` MUST carry it. Adapters MUST reject objects with mismatched versions (see falsification test).
- v0.1 is pre-stable. Optional additive fields stay at the current minor; breaking changes bump to a new file `intent-schema-v0.2.md` and a new version literal.
- The fixture in `src/fixtures/workspace.ts` is the *falsification fixture* — it must validate against `WorkspaceSchema` for every kind we claim to support. Adding a kind in v0.2 means adding an example here, and the test will fail until the schema accepts it.

## Test discipline (current and planned)

- **Schema layer (now):** zod runtime validators + Vitest tests covering acceptance, kind/extension consistency, schema_version literal, KnowledgeRef inheritance constraint, evidence-link shape, and projection budget.
- **Component layer (when surfaces land):** React Testing Library — assert user-visible behavior, never implementation details. Behavioral tests for: zoom toggle changes content, proposal accept fires the right callback, activity event scrolls to target, shaping commit gates correctly.
- **Critical flows (when surfaces land):** small Playwright suite for shape-and-commit, navigate-and-accept-proposal, activity-event-scroll-to-target.
- **Visual regression (when surfaces land):** Playwright screenshot diffs against the `ccdesign/` baseline so the cognitive-instrument aesthetic doesn't silently drift.

Playwright is intentionally not yet installed — it lands with the first real surface.

## Conventions

- Inline styles are fine for the placeholder. The real surfaces will use a styling solution we pick when we port the atoms (`../ccdesign/atoms.jsx`) — likely CSS variables in `index.css` + co-located component styles, mirroring the OKLCH palette and IBM Plex stack used in the mock.
- Test files live next to the code they test under `__tests__/`.
- New schema fields that are optional and additive can stay at v0.1.0; everything else bumps the schema version.
