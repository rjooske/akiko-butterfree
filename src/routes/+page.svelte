<script lang="ts">
  import { browser } from "$app/environment";
  import {
    type AlignEdge,
    type Corner,
    type NextClick,
    PAGE_COUNTS,
    type Picker,
    type Storage,
    YEARS,
    type Year,
    storageDecode,
    storageDefault,
    storageEncode,
  } from "$lib/storage";
  import { unreachable } from "$lib/util";

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
  let previewList = $state(initial.previewList);
  let previewIndex = $state(initial.previewIndex);
  let alignEdge = $state(initial.alignEdge);
  // transient, not persisted:
  let addYear = $state<Year>(2023);
  let addPage = $state(1);
  let prevPreviewIndex = $state<number | undefined>(undefined);

  $effect(() => {
    storageSave({
      mode,
      year,
      scale,
      pickers,
      previewList,
      previewIndex,
      alignEdge,
    });
  });

  let picker = $derived(pickers[year]);

  // For each previewList entry, compute a CSS transform that brings topLeft to
  // (0,0) and normalises content width to match the reference entry.
  let alignTransforms = $derived.by((): (AlignTransform | undefined)[] => {
    const refEntry = previewList.find((e) => {
      const c = pickers[e.year].corners[e.page];
      return c?.topLeft !== undefined && c?.bottomRight !== undefined;
    });
    if (!refEntry) return previewList.map(() => undefined);
    const refC = pickers[refEntry.year].corners[refEntry.page];
    const rcw = refC!.bottomRight!.x - refC!.topLeft!.x;
    const refH = refC!.bottomRight!.y - refC!.topLeft!.y;
    return previewList.map((e) => {
      const c = pickers[e.year].corners[e.page];
      if (!c?.topLeft || !c?.bottomRight) return undefined;
      const sx = rcw / (c.bottomRight.x - c.topLeft.x);
      const tx = -sx * c.topLeft.x;
      const ty =
        alignEdge === "top" ? -sx * c.topLeft.y : refH - sx * c.bottomRight.y;
      return { tx, ty, sx };
    });
  });

  let previewItems = $derived(
    previewList.map((entry, index) => ({
      entry,
      transform: alignTransforms[index],
      index,
    })),
  );

  function selectYear(y: Year) {
    mode = "picker";
    year = y;
  }

  function openInPicker(y: Year, page: number) {
    year = y;
    pickerSetPage(pickers[y], page);
    mode = "picker";
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
    scale = Math.min(
      4,
      Math.max(0.1, Math.round((scale + delta * 0.1) * 10) / 10),
    );
  }

  function enterPreview() {
    mode = "preview";
  }

  function handleClearPage() {
    delete picker.corners[picker.page];
    picker.nextClick = "top-left";
  }

  function handleAddCurrentPage() {
    const c = picker.corners[picker.page];
    if (!c?.topLeft || !c?.bottomRight) return;
    if (previewList.some((e) => e.year === year && e.page === picker.page))
      return;
    previewList = [...previewList, { year, page: picker.page }];
    previewIndex = previewList.length - 1;
  }

  function handleAddEntry() {
    const c = pickers[addYear].corners[addPage];
    if (!c?.topLeft || !c?.bottomRight) return;
    if (previewList.some((e) => e.year === addYear && e.page === addPage))
      return;
    previewList = [...previewList, { year: addYear, page: addPage }];
    previewIndex = previewList.length - 1;
  }

  function handleRemoveEntry(i: number) {
    previewList = previewList.filter((_, idx) => idx !== i);
    previewIndex =
      previewList.length === 0
        ? 0
        : Math.min(previewIndex, previewList.length - 1);
  }

  function handleMoveEntry(i: number, delta: 1 | -1) {
    const j = i + delta;
    if (j < 0 || j >= previewList.length) return;
    const newList = [...previewList];
    [newList[i], newList[j]] = [newList[j], newList[i]];
    previewList = newList;
    if (previewIndex === i) previewIndex = j;
    else if (previewIndex === j) previewIndex = i;
  }

  function navigatePreview(newIndex: number) {
    prevPreviewIndex = previewIndex;
    previewIndex = newIndex;
  }

  function handlePreviewCycle(delta: 1 | -1) {
    const n = previewList.length;
    if (n === 0) return;
    navigatePreview((previewIndex + delta + n) % n);
  }

  function handlePrevPreviewEntry() {
    if (
      prevPreviewIndex === undefined ||
      prevPreviewIndex >= previewList.length
    )
      return;
    const target = prevPreviewIndex;
    prevPreviewIndex = previewIndex;
    previewIndex = target;
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

  type Action =
    | { kind: "tab-step"; delta: -1 | 1 }
    | { kind: "zoom-step"; delta: -1 | 1 }
    | { kind: "page-step"; delta: -1 | 1 }
    | { kind: "add-page" }
    | { kind: "clear-page" }
    | { kind: "preview-cycle"; delta: -1 | 1 }
    | { kind: "move-entry"; delta: -1 | 1 }
    | { kind: "remove-entry" }
    | { kind: "prev-entry" }
    | { kind: "open-in-picker" }
    | { kind: "set-align"; edge: AlignEdge };

  function keyToAction(
    key: string,
    mode: "picker" | "preview",
  ): Action | undefined {
    if (key === "h") return { kind: "tab-step", delta: -1 };
    if (key === "l") return { kind: "tab-step", delta: 1 };
    if (key === "+") return { kind: "zoom-step", delta: 1 };
    if (key === "-") return { kind: "zoom-step", delta: -1 };
    if (mode === "picker") {
      if (key === "j") return { kind: "page-step", delta: 1 };
      if (key === "k") return { kind: "page-step", delta: -1 };
      if (key === "a") return { kind: "add-page" };
      if (key === "d") return { kind: "clear-page" };
    }
    if (mode === "preview") {
      if (key === "j") return { kind: "preview-cycle", delta: 1 };
      if (key === "k") return { kind: "preview-cycle", delta: -1 };
      if (key === "J") return { kind: "move-entry", delta: 1 };
      if (key === "K") return { kind: "move-entry", delta: -1 };
      if (key === "d") return { kind: "remove-entry" };
      if (key === "~") return { kind: "prev-entry" };
      if (key === "o") return { kind: "open-in-picker" };
      if (key === "g") return { kind: "set-align", edge: "top" };
      if (key === "G") return { kind: "set-align", edge: "bottom" };
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const active = document.activeElement;
    const inTextInput =
      active instanceof HTMLInputElement &&
      active.type !== "radio" &&
      active.type !== "range";
    if (inTextInput) return;
    const action = keyToAction(e.key, mode);
    if (!action) return;
    switch (action.kind) {
      case "tab-step":
        handleTabStep(action.delta);
        break;
      case "zoom-step":
        handleZoomStep(action.delta);
        break;
      case "page-step":
        handlePageStep(action.delta);
        break;
      case "add-page":
        handleAddCurrentPage();
        break;
      case "clear-page":
        handleClearPage();
        break;
      case "preview-cycle":
        handlePreviewCycle(action.delta);
        break;
      case "move-entry":
        handleMoveEntry(previewIndex, action.delta);
        break;
      case "remove-entry":
        handleRemoveEntry(previewIndex);
        break;
      case "prev-entry":
        handlePrevPreviewEntry();
        break;
      case "open-in-picker":
        if (previewList.length > 0)
          openInPicker(
            previewList[previewIndex].year,
            previewList[previewIndex].page,
          );
        break;
      case "set-align":
        alignEdge = action.edge;
        break;
      default:
        unreachable(action);
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
      <div class="controls-group">
        <button
          class="btn"
          onclick={handleClearPage}
          disabled={!tl && !br}
          title="クリア (d)"
        >
          クリア
        </button>
        <button
          class="btn"
          onclick={handleAddCurrentPage}
          disabled={!tl ||
            !br ||
            previewList.some((e) => e.year === year && e.page === picker.page)}
          title="プレビューに使う (a)"
        >
          プレビューに使う
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
        <button
          class="btn"
          onclick={handlePrevPreviewEntry}
          disabled={prevPreviewIndex === undefined ||
            prevPreviewIndex >= previewList.length}
          title="1つ前のページ (~)"
        >
          1つ前のページ
        </button>
      </div>
    </div>

    <aside class="sidebar">
      {#each previewItems as { entry, index }}
        <div
          class="chip"
          aria-current={index === previewIndex ? "true" : undefined}
          onclick={() => navigatePreview(index)}
        >
          <span>{entry.year} p.{entry.page}</span>
          <button
            onclick={(e) => {
              e.stopPropagation();
              openInPicker(entry.year, entry.page);
            }}
            title="ピッカーで開く (o)"
          >
            ✎
          </button>
          <button
            onclick={(e) => {
              e.stopPropagation();
              handleMoveEntry(index, -1);
            }}
            disabled={index === 0}
            title="上へ (K)"
          >
            ↑
          </button>
          <button
            onclick={(e) => {
              e.stopPropagation();
              handleMoveEntry(index, 1);
            }}
            disabled={index === previewList.length - 1}
            title="下へ (J)"
          >
            ↓
          </button>
          <button
            onclick={(e) => {
              e.stopPropagation();
              handleRemoveEntry(index);
            }}
            title="削除 (d)"
          >
            ×
          </button>
        </div>
      {/each}
      <div class="add-form">
        <select bind:value={addYear}>
          {#each YEARS as y}<option value={y}>{y}</option>{/each}
        </select>
        <input
          type="number"
          min="1"
          max={PAGE_COUNTS[addYear]}
          bind:value={addPage}
        />
        <button
          onclick={handleAddEntry}
          disabled={!pickers[addYear].corners[addPage]?.topLeft ||
            !pickers[addYear].corners[addPage]?.bottomRight ||
            previewList.some((e) => e.year === addYear && e.page === addPage)}
        >
          追加
        </button>
      </div>
    </aside>

    <div class="viewer">
      {#if browser}
        {#each previewItems as { entry, transform, index }}
          <img
            src={svgUrl(entry.year, entry.page)}
            alt="{entry.year}年{entry.page}ページ目"
            style="top: {16 * scale}px; left: {16 * scale}px;
                  transform: translate({(transform?.tx ?? 0) * scale}px,
                    {(transform?.ty ?? 0) * scale}px) scale({(transform?.sx ??
              1) * scale});
                  opacity: {index === previewIndex && transform !== undefined
              ? 1
              : 0};"
          />
        {/each}
      {/if}
    </div>
  {/if}
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
    overflow: hidden;
  }

  [data-mode="picker"] {
    grid-template-rows: auto auto auto 1fr;
    grid-template-areas:
      "header"
      "controls"
      "info"
      "viewer";
  }

  [data-mode="preview"] {
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto 1fr;
    grid-template-areas:
      "header   header"
      "controls controls"
      "sidebar  viewer";
  }

  header {
    grid-area: header;
  }
  .controls {
    grid-area: controls;
  }
  .info {
    grid-area: info;
  }
  .viewer {
    grid-area: viewer;
    min-height: 0;
  }
  .sidebar {
    grid-area: sidebar;
    min-height: 0;
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

  .btn {
    border: 1px solid $color-border;
    border-radius: 4px;
    background: transparent;
    color: $color-text;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    padding: 2px 8px;
    &:hover:not(:disabled) {
      border-color: $color-accent;
      color: $color-accent;
    }
    &:disabled {
      color: $color-text-muted;
      cursor: default;
    }
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

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: $sp-xs;
    padding: $sp-sm;
    border-right: 1px solid $color-border;
    background: $color-surface;
    overflow-y: auto;
    min-width: 130px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: $sp-xs;
    padding: 2px $sp-xs;
    border: 1px solid $color-border;
    border-radius: 4px;
    font-size: 13px;
    font-family: $font-mono;
    cursor: pointer;

    > span {
      flex: 1;
    }

    &[aria-current="true"] {
      border-color: $color-accent;
      background: $color-accent;
      color: $color-surface;
    }

    button {
      border: none;
      background: transparent;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
      color: inherit;
      &:hover:not(:disabled) {
        color: $color-accent;
      }
      &:disabled {
        opacity: 0.3;
        cursor: default;
      }
    }
  }

  .add-form {
    display: flex;
    flex-direction: column;
    gap: $sp-xs;
    margin-top: $sp-sm;

    select,
    input[type="number"] {
      border: 1px solid $color-border;
      border-radius: 4px;
      padding: 2px $sp-xs;
      background: $color-surface;
      color: $color-text;
      font-family: inherit;
      font-size: inherit;
      width: 100%;
      box-sizing: border-box;
    }

    input[type="number"] {
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
      padding: 2px 8px;
      &:hover:not(:disabled) {
        border-color: $color-accent;
        color: $color-accent;
      }
      &:disabled {
        color: $color-text-muted;
        cursor: default;
      }
    }
  }
</style>
