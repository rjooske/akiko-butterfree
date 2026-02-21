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

**The entire application lives in one file: `src/routes/+page.svelte`.**

The app overlays scanned schedule pages from multiple years (2023/2024/2025) to compare them visually. Two modes:

- **picker mode** — the user browses SVG pages for a given year and clicks two corners (top-left, bottom-right) to define a bounding rectangle.
- **preview mode** — all years with defined corners are rendered overlaid using CSS transforms derived from the corner coordinates, with one year visible at a time.

SVG assets live in `static/tables/{year}/{zero-padded-page}.svg` (e.g. `static/tables/2023/042.svg`). Page counts per year are hardcoded in `PAGE_COUNTS`.

All reactive state is Svelte 5 runes (`$state`, `$derived`, `$effect`). State is persisted to `localStorage` under `STORAGE_KEY` (`"akiko-butterfree"`), with typed encode/decode functions that return `undefined` on any validation failure.

SVG `<img>` elements are wrapped in `{#if browser}` to prevent hydration mismatches between the server-prerendered default state and the localStorage-restored client state.

### Keyboard shortcuts

| Key             | Mode    | Action                                              |
| --------------- | ------- | --------------------------------------------------- |
| `h` / `l`       | both    | cycle tabs (2023 → 2024 → 2025 → プレビュー, wraps) |
| `j` / `k`       | picker  | next / previous page                                |
| `3` / `4` / `5` | preview | switch to that year (only if corners are set)       |

### Styling

Shared SCSS variables live in `src/routes/variables.scss` (imported as `@use "./variables" as *`):

- **Spacing**: `$sp-xs` (4px), `$sp-sm` (8px), `$sp-md` (16px), `$sp-lg` (24px)
- **Colors**: `$color-bg`, `$color-surface`, `$color-border`, `$color-text`, `$color-text-muted`, `$color-accent`
- **Fonts**: `$font-sans`, `$font-mono`; size: `$font-h1`
- **Misc**: `$marker-size`

Key CSS classes in `+page.svelte`: `.controls` (flex toolbar row, surface background), `.info` (muted monospace status row), `.viewer` (scrollable SVG area), `.page-control` (page input + step buttons).

## Code conventions

- **Script organisation**: each type is immediately followed by its related pure functions; pure functions come before impure ones; event handlers (which mutate `$state`) come last.
- **Decode functions** (`cornerDecode`, `pickerDecode`, `storageDecode`) return `T | undefined` — any unexpected shape yields `undefined`.
- **`NextClick` values** (`"top-left"`, `"bottom-right"`) are internal identifiers; display is handled by `nextClickToJa()`.
- All UI-visible text is in Japanese.
- `src/lib/util.ts` holds generic utilities (`assert`, `sortByKeyCached`).
