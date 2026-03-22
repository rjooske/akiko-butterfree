# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # dev server on port 32524
npm run build     # production build → build/
npm run check     # svelte-check type checking (0 errors, 0 warnings is the bar)
npm run format    # prettier (also formats .svelte files)
npm run lint      # prettier --check
```

For a GitHub Pages build (sets the base path):

```bash
BASE_PATH=/repo-name npm run build
```

## Architecture

Single-page SvelteKit app statically prerendered (`src/routes/+layout.ts` exports `prerender = true`) and deployed to GitHub Pages via `.github/workflows/deploy.yml`.

**The application state and validation logic lives in `src/lib/storage.ts`.**
**The UI and interaction logic lives in `src/routes/+page.svelte`.**
**The keyboard shortcut reference lives in `src/routes/help/+page.svelte`** (linked from the main page's ヘルプ button). Keep it in sync with `keyToAction` whenever shortcuts change.

The app overlays scanned schedule pages from multiple years (2023/2024/2025) to compare them visually. Two modes:

- **picker mode** — the user browses SVG pages for a given year and clicks two points to define a bounding rectangle. Clicks snap to corners of parsed SVG rect paths; the two points are normalised so `topLeft = min(x,y)` and `bottomRight = max(x,y)` regardless of click order.
- **preview mode** — a user-managed list of `(year, page)` entries are rendered overlaid using CSS transforms derived from the corner coordinates, with one entry visible at a time.

SVG assets live in `static/tables/{year}/{zero-padded-page}.svg` (e.g. `static/tables/2023/042.svg`). Page counts per year are hardcoded in `PAGE_COUNTS`.

All reactive state is Svelte 5 runes (`$state`, `$derived`, `$effect`). State is persisted to `localStorage` under `STORAGE_KEY` (`"akiko-butterfree"`), with typed encode/decode functions that return `undefined` on any validation failure.

SVG `<img>` elements are wrapped in `{#if browser}` to prevent hydration mismatches between the server-prerendered default state and the localStorage-restored client state.

SVGs are fetched once and cached as blob URLs in `svgCache` (`Map<string, SvgPage>`). `SvgPage` carries `{ viewBox, blobUrl, snapRects }`. `snapRects` are the elongated rect paths parsed from the SVG (aspect ratio ≥ 11:1) used for corner snapping. `currentImage` is `$state` updated by a `$effect` that tracks `currentEntry`.

**`src/lib/geometry.ts`** — vector/segment/edge geometry types and math (copied from `src-other/lib/app.ts`).
**`src/lib/svg.ts`** — parses SVG path data into `Rect[]` via `svg-parser` + `svg-path-parser`.
**`src/lib/constants.ts`** — `MAJORS`, `Major` type, `MAJOR_TO_JA` (Japanese display names), `majorCompare`.
**`src/lib/bookmark.ts`** — `YEAR_TO_MAJOR_TO_PAGE` and `YEAR_TO_PAGE_TO_MAJORS` mapping majors to page numbers per year. Used to populate the picker sidebar bookmarks.

### Keyboard shortcuts

| Key       | Mode    | Action                                              |
| --------- | ------- | --------------------------------------------------- |
| `h` / `l` | both    | cycle tabs (2023 → 2024 → 2025 → 2026 → プレビュー, wraps) |
| `+` / `-` | both    | zoom in / out (step 0.1, clamped to 0.1–4)          |
| `j` / `k` | picker  | next / previous bookmark                            |
| `a`       | picker  | add current page to preview list                    |
| `q`       | picker  | auto-set corners (largest valid rect from snap pts) |
| `w`       | picker  | download current page as `<year>-<page>.svg`        |
| `d`       | picker  | clear corners for current page                      |
| `j` / `k` | preview | cycle next / previous preview list entry            |
| `J` / `K` | preview | move current entry down / up in list                |
| `d`       | preview | remove current entry from list                      |
| `o`       | preview | open current entry in picker tab                    |
| `g` / `G` | preview | align top / bottom edge                             |
| `w` / `b` | preview | cycle next / previous entry of the same year        |
| `s`       | preview | sort list by major then year                        |

### Styling

Shared SCSS variables live in `src/routes/variables.scss` (imported as `@use "./variables" as *`):

- **Spacing**: `$sp-xs` (4px), `$sp-sm` (8px), `$sp-md` (16px), `$sp-lg` (24px)
- **Colors**: `$color-bg`, `$color-surface`, `$color-border`, `$color-text`, `$color-text-muted`, `$color-accent`
- **Fonts**: `$font-sans`, `$font-mono`; size: `$font-h1`
- **Misc**: `$marker-size`

`<main>` is the CSS Grid container; layout is defined with `grid-template-areas` per mode. Picker areas: `header` and `controls` span both columns, then `sidebar | info` and `sidebar | viewer` (sidebar spans last two rows). Preview areas: same two-column structure with `sidebar | viewer` in the last row.

Key CSS classes in `+page.svelte`: `.controls` (flex toolbar row, surface background), `.controls-group` (sub-group within a controls row, adds `$sp-sm` left margin for visual separation), `.info` (muted monospace status row, picker only), `.viewer` (scrollable SVG area), `.page-control` (page input + step buttons), `.btn` (generic styled action button in the toolbar), `.sidebar` (entry/bookmark list, grid area `sidebar`, used in both picker and preview modes), `.chip` (one entry row in the sidebar), `.add-form` (form to add an entry to the sidebar), `.corner-marker` (selected corner dot, uses `--size: $marker-size`), `.snap-indicator` (hover snap ring, uses `--size: 16px`).

## Code conventions

- **Script organisation**: each type is immediately followed by its related pure functions; pure functions come before impure ones; event handlers (which mutate `$state`) come last.
- **Decode functions** (`cornerDecode`, `pickerDecode`, `storageDecode`) return `T | undefined` — any unexpected shape yields `undefined`.
- **`AlignEdge` values** (`"top"`, `"bottom"`) control which edge is aligned in preview mode; persisted in `Storage` and decoded leniently (unknown values fall back to `"top"`).
- **Keyboard actions**: `type Action` (discriminated union on `kind`) and pure function `keyToAction(key, mode)` map keys to actions; `handleKeydown` dispatches via `switch (action.kind)` with `unreachable(action)` in the default case.
- All UI-visible text is in Japanese.
- `src/lib/util.ts` holds generic utilities (`assert`, `unreachable`, `sortByKeyCached`, `minByKey`, `maxByKey`, `tryParseFloat`, `sleep`, `Throttle`).
