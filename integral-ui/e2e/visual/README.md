# Visual regression baselines

Playwright screenshot diffs that lock the v0.1 chrome's cognitive-instrument
aesthetic so refactors don't silently drift toward Linear/Jira shape.

## What's baselined

15 screenshots covering:

- Landing surface (default state)
- Map surface (default zoom; awaiting-me filter active)
- Detail surface — one per `IntentKind` at `structure` zoom (9 total)
- Detail surface — `nous-iteration` at `detail` zoom
- Workspace Activity Strip (notable+ filter, routine expanded)
- Shaping surface (fully-resolved Nous draft)

## How to run

```sh
# Diff against committed baselines (asserts).
npm run test:e2e:visual

# Regenerate baselines (after intentional chrome changes).
npm run test:e2e:visual:update
```

The `chromium` project (default `npm run test:e2e`) excludes this directory
via `testIgnore` so visual diffs don't run on every behavioral pass.

## Canonical capture machine

Screenshot diffs are sensitive to OS, browser version, font rendering, and
DPR. The committed baselines were captured on:

- **OS**: macOS 14+ (Darwin 25.x)
- **Browser**: Chromium bundled with `@playwright/test ^1.60` (Desktop Chrome
  device profile)
- **DPR**: 2× (`deviceScaleFactor: 2` in the visual project config)
- **Viewport**: 1440 × 900
- **Fonts**: IBM Plex Sans / Mono / Serif, loaded via Google Fonts; every
  test gates on `document.fonts.ready` before screenshot.

If your machine differs from this profile (Linux, low-DPI display, missing
Plex fonts), expect baseline drift. Regenerate locally with `:update` and
inspect the diff before committing.

## Tolerance

Configured in `playwright.config.ts`:

```ts
expect: {
  toHaveScreenshot: {
    maxDiffPixelRatio: 0.01,   // 1% of pixels may differ
    animations: 'disabled',    // freeze any in-flight animations
  },
}
```

A 1% tolerance covers anti-aliasing jitter and minor text reflow without
masking real drift (e.g., color tokens, layout shifts).

## First-run policy

Per the goals.md "assert vs warn" decision, the first session that lands
this baseline runs `:update` once to capture all 15 PNGs and commits them.
Subsequent sessions run `:visual` (diff-asserting). Promoting from
warn-only to assert-only happens automatically — Playwright's default
behavior is to fail when a baseline is missing, so once committed, future
runs assert.

## When a diff fails

Open the report (`npx playwright show-report`) to see the side-by-side
diff. Three outcomes:

1. **Genuine regression** — fix the surface, re-run `:visual`.
2. **Intentional chrome change** — run `:update`, review the diff in git,
   commit the new baseline alongside the surface change.
3. **Platform drift** — your machine doesn't match the canonical profile.
   Don't update baselines from a non-canonical machine; either capture on
   one or document why the alternative profile is acceptable.

## Out of scope (v0.1)

- Cross-browser baselines (Chromium only).
- Mobile / narrow viewports.
- Hover, focus, and active-state baselines (default states only).
- Pixel-perfect parity with `ccdesign/` — that prototype is the genre
  reference, not the spec; some intentional drift is expected.
