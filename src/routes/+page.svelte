<script lang="ts">
  import { browser } from "$app/environment";
  import {
    type Corner,
    type NextClick,
    PAGE_COUNTS,
    type Picker,
    type Storage,
    YEARS,
    type Year,
    pickerCanPreview,
    storageDecode,
    storageDefault,
    storageEncode,
  } from "$lib/storage";

  const STORAGE_KEY = "akiko-butterfree";

  function storageLoad(): Storage {
    if (!browser) return storageDefault();
    try {
      return (
        storageDecode(
          JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"),
        ) ?? storageDefault()
      );
    } catch {
      return storageDefault();
    }
  }

  function storageSave(s: Storage): void {
    if (!browser) return;
    localStorage.setItem(STORAGE_KEY, storageEncode(s));
  }

  function nextClickToJa(n: NextClick): string {
    return n === "top-left" ? "左上" : "右下";
  }

  function svgUrl(year: Year, page: number): string {
    return `${import.meta.env.BASE_URL}tables/${year}/${String(page).padStart(3, "0")}.svg`;
  }

  type AlignTransform = { tx: number; ty: number; sx: number };

  const initial = storageLoad();
  let mode = $state(initial.mode);
  let year = $state(initial.year);
  let scale = $state(initial.scale);
  let pickers = $state(initial.pickers);
  let previewYear = $state(initial.previewYear);
  let alignEdge = $state(initial.alignEdge);

  $effect(() => {
    storageSave({ mode, year, scale, pickers, previewYear, alignEdge });
  });

  let picker = $derived(pickers[year]);

  // For each year, compute a CSS transform that brings topLeft to (0,0) and
  // normalises content width to match the reference year. Bake scale in later.
  let alignTransforms = $derived.by(
    (): Record<Year, AlignTransform | undefined> => {
      const refYear = YEARS.find((y) => pickerCanPreview(pickers[y]));
      if (!refYear)
        return { 2023: undefined, 2024: undefined, 2025: undefined };

      const ref = pickers[refYear];
      const refC = ref.corners[ref.page];
      const rcw = refC.bottomRight!.x - refC.topLeft!.x;
      const refH = refC.bottomRight!.y - refC.topLeft!.y;

      function compute(p: Picker): AlignTransform | undefined {
        const c = p.corners[p.page];
        if (!c?.topLeft || !c?.bottomRight) return undefined;
        const sx = rcw / (c.bottomRight.x - c.topLeft.x);
        const tx = -sx * c.topLeft.x;
        const ty =
          alignEdge === "top" ? -sx * c.topLeft.y : refH - sx * c.bottomRight.y;
        return { tx, ty, sx };
      }

      return {
        2023: compute(pickers[2023]),
        2024: compute(pickers[2024]),
        2025: compute(pickers[2025]),
      };
    },
  );

  let previewItems = $derived(
    YEARS.flatMap((y) => {
      const t = alignTransforms[y];
      return t ? [{ y, t }] : [];
    }),
  );

  function selectYear(y: Year) {
    mode = "picker";
    year = y;
  }

  function pickerSetPage(p: Picker, newPage: number) {
    p.page = newPage;
    const c = p.corners[newPage];
    p.nextClick =
      c?.topLeft !== undefined && c?.bottomRight === undefined
        ? "bottom-right"
        : "top-left";
  }

  function handleClick(e: MouseEvent) {
    const x = e.offsetX / scale;
    const y = e.offsetY / scale;
    const page = picker.page;
    if (picker.nextClick === "top-left") {
      picker.corners[page] = { topLeft: { x, y }, bottomRight: undefined };
      picker.nextClick = "bottom-right";
    } else {
      const existing = picker.corners[page];
      picker.corners[page] = {
        topLeft: existing?.topLeft,
        bottomRight: { x, y },
      };
      picker.nextClick = "top-left";
    }
  }

  function handlePageInput(e: Event & { currentTarget: HTMLInputElement }) {
    const value = e.currentTarget.valueAsNumber;
    if (!Number.isInteger(value) || value < 1 || value > PAGE_COUNTS[year])
      return;
    if (value === picker.page) return;
    pickerSetPage(picker, value);
  }

  function handlePageStep(delta: 1 | -1) {
    const next = picker.page + delta;
    if (next < 1 || next > PAGE_COUNTS[year]) return;
    pickerSetPage(picker, next);
  }

  function handleZoomStep(delta: 1 | -1) {
    scale = Math.min(4, Math.max(0.1, Math.round((scale + delta * 0.1) * 10) / 10));
  }

  function enterPreview() {
    mode = "preview";
    if (!pickerCanPreview(pickers[previewYear])) {
      const first = YEARS.find((y) => pickerCanPreview(pickers[y]));
      if (first !== undefined) previewYear = first;
    }
  }

  function handleTabStep(delta: 1 | -1) {
    const n = YEARS.length + 1;
    const current = mode === "preview" ? YEARS.length : YEARS.indexOf(year);
    const next = (current + delta + n) % n;
    if (next === YEARS.length) {
      enterPreview();
    } else {
      selectYear(YEARS[next]);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const active = document.activeElement;
    const inTextInput =
      active instanceof HTMLInputElement &&
      active.type !== "radio" &&
      active.type !== "range";
    if (!inTextInput) {
      if (e.key === "h") {
        handleTabStep(-1);
        return;
      }
      if (e.key === "l") {
        handleTabStep(1);
        return;
      }
      if (e.key === "+") {
        handleZoomStep(1);
        return;
      }
      if (e.key === "-") {
        handleZoomStep(-1);
        return;
      }
      if (mode === "picker") {
        if (e.key === "j") {
          handlePageStep(1);
          return;
        }
        if (e.key === "k") {
          handlePageStep(-1);
          return;
        }
      }
    }
    if (mode !== "preview") return;
    if (inTextInput) return;
    for (const y of YEARS) {
      if (e.key === String(y % 10) && pickerCanPreview(pickers[y])) {
        previewYear = y;
        break;
      }
    }
    if (e.key === "g") {
      alignEdge = "top";
    }
    if (e.key === "G") {
      alignEdge = "bottom";
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet cornerMarker(corner: Corner, color: string)}
  <div
    style="background: {color}; transform: translate(calc({corner.x *
      scale}px - 5px), calc({corner.y * scale}px - 5px));"
  ></div>
{/snippet}

<main data-mode={mode}>
  <header>
    <h1>
      <img src="akiko-butterfree.png" alt="あきこバタフリー" />
      <span>あきこバタフリー</span>
    </h1>
    <nav>
      <button
        onclick={() => selectYear(2023)}
        aria-current={mode === "picker" && year === 2023 ? "true" : undefined}
        title="2023 (h/l)"
      >
        2023
      </button>
      <button
        onclick={() => selectYear(2024)}
        aria-current={mode === "picker" && year === 2024 ? "true" : undefined}
        title="2024 (h/l)"
      >
        2024
      </button>
      <button
        onclick={() => selectYear(2025)}
        aria-current={mode === "picker" && year === 2025 ? "true" : undefined}
        title="2025 (h/l)"
      >
        2025
      </button>
      <button
        onclick={enterPreview}
        aria-current={mode === "preview" ? "true" : undefined}
        title="プレビュー (h/l)"
      >
        プレビュー
      </button>
    </nav>
  </header>

  <div>
    {#if mode === "picker"}
      {@const tl = picker.corners[picker.page]?.topLeft}
      {@const br = picker.corners[picker.page]?.bottomRight}

      <div class="controls">
        <label>
          拡大
          <input type="range" min="0.1" max="4" step="0.1" bind:value={scale} />
          {scale.toFixed(1)}
        </label>
        <div class="page-control">
          ページ
          <input
            type="number"
            min="1"
            max={PAGE_COUNTS[year]}
            value={picker.page}
            oninput={handlePageInput}
          />
          <button onclick={() => handlePageStep(-1)} title="前のページ (k)">
            ↑
          </button>
          <button onclick={() => handlePageStep(1)} title="次のページ (j)">
            ↓
          </button>
        </div>
      </div>

      <div class="info">
        <span>次のクリック: {nextClickToJa(picker.nextClick)}</span>
        <span>
          左上: {tl ? `(${tl.x.toFixed(1)}, ${tl.y.toFixed(1)})` : "—"}
        </span>
        <span>
          右下: {br ? `(${br.x.toFixed(1)}, ${br.y.toFixed(1)})` : "—"}
        </span>
      </div>

      <div class="viewer">
        {#if browser}
          <img
            src={svgUrl(year, picker.page)}
            alt="{picker.page}ページ目"
            style="width: {scale * 100}%;"
            onclick={handleClick}
          />
        {/if}
        {#if tl}
          {@render cornerMarker(tl, "rgba(255, 0, 0, 0.5)")}
        {/if}
        {#if br}
          {@render cornerMarker(br, "rgba(0, 200, 0, 0.5)")}
        {/if}
      </div>
    {:else}
      <div class="controls">
        <label>
          拡大
          <input type="range" min="0.1" max="4" step="0.1" bind:value={scale} />
          {scale.toFixed(1)}
        </label>
        <div class="controls-group">
          <label title="上端揃え (g)">
            <input
              type="radio"
              name="alignEdge"
              value="top"
              bind:group={alignEdge}
            />
            上端揃え
          </label>
          <label title="下端揃え (G)">
            <input
              type="radio"
              name="alignEdge"
              value="bottom"
              bind:group={alignEdge}
            />
            下端揃え
          </label>
        </div>
        <div class="controls-group">
          {#each YEARS as y}
            <label
              title={pickerCanPreview(pickers[y])
                ? `${y} (${y % 10})`
                : undefined}
            >
              <input
                type="radio"
                name="previewYear"
                value={y}
                bind:group={previewYear}
                disabled={!pickerCanPreview(pickers[y])}
              />
              {y}
            </label>
          {/each}
        </div>
      </div>

      <div class="viewer">
        {#if browser}
          {#each previewItems as { y, t }}
            <img
              src={svgUrl(y, pickers[y].page)}
              alt="{y}年{pickers[y].page}ページ目"
              style="top: {16 * scale}px; left: {16 * scale}px; transform: translate({t.tx * scale}px, {t.ty *
                scale}px) scale({t.sx * scale}); opacity: {previewYear === y
                ? 1
                : 0};"
            />
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</main>

<style lang="scss">
  @use "./variables" as *;

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    height: 100%;
  }

  :global(body) {
    background: $color-bg;
    color: $color-text;
    font-family: $font-sans;
  }

  main {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: auto 1fr;

    > div {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
  }

  header {
    display: flex;
    align-items: center;
    gap: $sp-lg;
    padding: $sp-sm $sp-md;
    background: $color-surface;
    border-bottom: 1px solid $color-border;

    h1 {
      margin: 0;
      font-size: $font-h1;
      font-weight: normal;
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: $sp-sm;
      img {
        height: 1.5em;
      }
    }

    nav {
      display: flex;
      gap: $sp-sm;

      button {
        padding: 4px 10px;
        border: 1px solid $color-border;
        border-radius: 4px;
        background: transparent;
        color: $color-text;
        cursor: pointer;
        font-family: inherit;
        font-size: inherit;

        &:hover {
          border-color: $color-accent;
          color: $color-accent;
        }

        &[aria-current="true"] {
          background: $color-accent;
          border-color: $color-accent;
          color: $color-surface;
        }
      }
    }
  }

  .controls {
    display: flex;
    align-items: center;
    gap: $sp-md;
    padding: $sp-sm $sp-md;
    border-bottom: 1px solid $color-border;
    background: $color-surface;

    label {
      display: flex;
      align-items: center;
      gap: $sp-xs;

      input[type="radio"] {
        margin: 0;
      }

      &:has(input:disabled) {
        color: $color-text-muted;
        cursor: default;
      }
    }
  }

  .controls-group {
    display: flex;
    align-items: center;
    gap: $sp-md;
    margin-left: $sp-sm;
  }

  .page-control {
    display: flex;
    align-items: center;
    gap: $sp-sm;

    input[type="number"] {
      width: 4em;
      appearance: textfield;
      -moz-appearance: textfield;
      &::-webkit-inner-spin-button,
      &::-webkit-outer-spin-button {
        appearance: none;
      }
    }

    button {
      border: 1px solid $color-border;
      border-radius: 4px;
      background: transparent;
      color: $color-text;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      line-height: 1;
      padding: 2px 6px;
      &:hover {
        border-color: $color-accent;
        color: $color-accent;
      }
    }
  }

  .info {
    display: flex;
    align-items: center;
    gap: $sp-md;
    padding: $sp-sm $sp-md;
    font-size: 13px;
    color: $color-text-muted;
    font-family: $font-mono;
  }

  .viewer {
    flex: 1;
    overflow: auto;
    position: relative;

    > img {
      display: block;
      cursor: crosshair;
    }

    > div {
      position: absolute;
      top: 0;
      left: 0;
      width: $marker-size;
      height: $marker-size;
      border-radius: 50%;
      pointer-events: none;
    }
  }

  [data-mode="preview"] .viewer > img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    transform-origin: 0 0;
    pointer-events: none;
  }
</style>
