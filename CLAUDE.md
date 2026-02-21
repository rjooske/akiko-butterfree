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

## Code conventions

- **Script organisation**: each type is immediately followed by its related pure functions; pure functions come before impure ones; event handlers (which mutate `$state`) come last.
- **Decode functions** (`cornerDecode`, `pickerDecode`, `storageDecode`) return `T | undefined` — any unexpected shape yields `undefined`.
- **`NextClick` values** (`"top-left"`, `"bottom-right"`) are internal identifiers; display is handled by `nextClickToJa()`.
- All UI-visible text is in Japanese.
- `src/lib/util.ts` holds generic utilities (`assert`, `sortByKeyCached`).
