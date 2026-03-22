<script lang="ts">
  import { browser } from "$app/environment";
  import { resolve } from "$app/paths";
  import { type Major, MAJOR_TO_JA } from "$lib/constants";
  import { YEAR_TO_PAGE_TO_MAJORS, type PageToMajors } from "$lib/bookmark";
  import {
    type AlignEdge,
    type Corner,
    PAGE_COUNTS,
    type Picker,
    type Storage,
    YEARS,
    type Year,
    storageDecode,
    storageDefault,
    storageEncode,
  } from "$lib/storage";
  import { parseSvg } from "$lib/svg";
  import { Throttle, minByKey, unreachable } from "$lib/util";
  import { tick } from "svelte";

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

  function svgUrl(year: Year, page: number): string {
    return `${import.meta.env.BASE_URL}tables/${year}/${String(page).padStart(3, "0")}.svg`;
  }

  function svgKey(year: Year, page: number): string {
    return `${year}-${page}`;
  }

  type AlignTransform = { tx: number; ty: number; sx: number };
  type SnapRect = { x: number; y: number; width: number; height: number };
  type SvgPage = {
    viewBox: { w: number; h: number };
    blobUrl: string;
    snapRects: SnapRect[];
  };
  type Bookmark = { page: number; names: Major[] };

  function pageToMajorsToBookmarks(m: PageToMajors): Bookmark[] {
    return (Object.entries(m) as [string, Major[]][])
      .map(([page, names]) => ({ page: Number(page), names }))
      .sort((a, b) => a.page - b.page);
  }

  const bookmarks: Record<Year, Bookmark[]> = {
    2023: pageToMajorsToBookmarks(YEAR_TO_PAGE_TO_MAJORS[2023]),
    2024: pageToMajorsToBookmarks(YEAR_TO_PAGE_TO_MAJORS[2024]),
    2025: pageToMajorsToBookmarks(YEAR_TO_PAGE_TO_MAJORS[2025]),
  };

  const svgCache = new Map<string, SvgPage>();

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
  let pickerViewer = $state<HTMLElement | undefined>();
  let previewViewer = $state<HTMLElement | undefined>();
  let activeViewer = $derived(mode === "picker" ? pickerViewer : previewViewer);
  let currentImage = $state<SvgPage | undefined>(undefined);
  let snapCorner = $state<{ x: number; y: number } | undefined>(undefined);

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
  let pickerBookmarks = $derived(bookmarks[year]);

  let currentEntry = $derived(
    mode === "picker" ? { year, page: picker.page } : previewList[previewIndex],
  );

  $effect(() => {
    const entry = currentEntry;
    if (!entry || !browser) {
      currentImage = undefined;
      return;
    }
    const key = svgKey(entry.year, entry.page);
    const cached = svgCache.get(key);
    if (cached) {
      currentImage = cached;
      return;
    }
    currentImage = undefined;
    let active = true;
    (async () => {
      const text = await (await fetch(svgUrl(entry.year, entry.page))).text();
      if (!active) return;
      const m = text.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      const viewBox = m
        ? { w: parseFloat(m[1]), h: parseFloat(m[2]) }
        : { w: 0, h: 0 };
      const parsed = parseSvg(text);
      const snapRects: SnapRect[] = [];
      if (parsed) {
        for (const r of parsed.rects) {
          if (Math.max(r.width, r.height) / Math.min(r.width, r.height) < 11)
            continue;
          snapRects.push(r);
        }
      }
      const blob = new Blob([text], { type: "image/svg+xml" });
      const page: SvgPage = {
        viewBox,
        blobUrl: URL.createObjectURL(blob),
        snapRects,
      };
      svgCache.set(key, page);
      if (active) currentImage = page;
    })().catch(() => {});
    return () => {
      active = false;
    };
  });

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
    previewList.map((entry, index) => ({ entry, index })),
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
  }

  function getSnapCorner(pos: {
    x: number;
    y: number;
  }): { x: number; y: number } | undefined {
    const rects = currentImage?.snapRects ?? [];
    const corners = rects.flatMap((r) => [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x, y: r.y + r.height },
      { x: r.x + r.width, y: r.y + r.height },
    ]);
    const c = minByKey(corners, (c) => Math.hypot(c.x - pos.x, c.y - pos.y));
    if (!c) return undefined;
    return Math.hypot(c.x - pos.x, c.y - pos.y) < 50 / scale ? c : undefined;
  }

  function findBestCorners(
    snapRects: SnapRect[],
  ): { topLeft: Corner; bottomRight: Corner } | undefined {
    const pts = snapRects.flatMap((r) => [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x, y: r.y + r.height },
      { x: r.x + r.width, y: r.y + r.height },
    ]);
    const has = (x: number, y: number) =>
      pts.some((p) => Math.hypot(p.x - x, p.y - y) <= 0.001);
    let bestArea = 0;
    let best: { topLeft: Corner; bottomRight: Corner } | undefined;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const tlx = Math.min(pts[i].x, pts[j].x);
        const tly = Math.min(pts[i].y, pts[j].y);
        const brx = Math.max(pts[i].x, pts[j].x);
        const bry = Math.max(pts[i].y, pts[j].y);
        const area = (brx - tlx) * (bry - tly);
        if (area <= bestArea) continue;
        if (!has(tlx, bry) || !has(brx, tly)) continue;
        bestArea = area;
        best = { topLeft: { x: tlx, y: tly }, bottomRight: { x: brx, y: bry } };
      }
    }
    return best;
  }

  function handleClick(e: MouseEvent) {
    if (!(e.target instanceof HTMLImageElement)) return;
    const rect = e.target.getBoundingClientRect();
    const pos = {
      x: (e.clientX - rect.x) / scale,
      y: (e.clientY - rect.y) / scale,
    };
    const snapped = getSnapCorner(pos);
    const { x, y } = snapped ?? pos;
    const page = picker.page;
    const existing = picker.corners[page];
    if (existing?.topLeft && existing?.bottomRight) return;
    if (!existing?.topLeft) {
      picker.corners[page] = { topLeft: { x, y }, bottomRight: undefined };
    } else {
      const p1 = existing.topLeft;
      picker.corners[page] = {
        topLeft: { x: Math.min(p1.x, x), y: Math.min(p1.y, y) },
        bottomRight: { x: Math.max(p1.x, x), y: Math.max(p1.y, y) },
      };
    }
  }

  const handleMouseMoveThrottled = new Throttle(50, (e: MouseEvent) => {
    if (!(e.target instanceof HTMLImageElement)) {
      snapCorner = undefined;
      return;
    }
    const rect = e.target.getBoundingClientRect();
    const pos = {
      x: (e.clientX - rect.x) / scale,
      y: (e.clientY - rect.y) / scale,
    };
    snapCorner = getSnapCorner(pos);
  });

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

  function handleBookmarkCycle(delta: 1 | -1) {
    const bs = pickerBookmarks;
    if (bs.length === 0) return;
    const pos = bs.findIndex((b) => b.page === picker.page);
    if (pos === -1) {
      // not on a bookmark: jump to nearest in direction
      const target =
        delta === 1
          ? bs.find((b) => b.page > picker.page)
          : [...bs].reverse().find((b) => b.page < picker.page);
      if (target) pickerSetPage(picker, target.page);
    } else {
      const next = pos + delta;
      if (next < 0 || next >= bs.length) return;
      pickerSetPage(picker, bs[next].page);
    }
  }

  function handleZoomStep(delta: 1 | -1) {
    scale = Math.min(
      4,
      Math.max(0.1, Math.round((scale + delta * 0.1) * 10) / 10),
    );
  }

  async function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const viewer = activeViewer;
    if (!viewer) return;
    const rect = viewer.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const oldScale = scale;
    const newScale = Math.min(
      10,
      Math.max(0.1, oldScale * Math.exp(-e.deltaY * 0.01)),
    );
    const f = newScale / oldScale;
    const newScrollLeft = (viewer.scrollLeft + cx) * f - cx;
    const newScrollTop = (viewer.scrollTop + cy) * f - cy;
    scale = newScale;
    await tick();
    viewer.scrollLeft = newScrollLeft;
    viewer.scrollTop = newScrollTop;
  }

  $effect(() => {
    if (!browser) return;
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  });

  function enterPreview() {
    mode = "preview";
  }

  function handleClearPage() {
    delete picker.corners[picker.page];
  }

  function handleAutoSetCorners() {
    const result = findBestCorners(currentImage?.snapRects ?? []);
    if (!result) return;
    picker.corners[picker.page] = result;
  }

  async function handleOpenInVenusaur() {
    const image = currentImage;
    if (!image) return;
    const text = await (await fetch(image.blobUrl)).text();
    localStorage.setItem("butterfree-to-venusaur", text);
    window.open("https://rjooske.github.io/akiko-venusaur/", "_blank");
  }

  async function handleDownloadPage() {
    const image = currentImage;
    if (!image) return;
    const filename = `${year}-${String(picker.page).padStart(3, "0")}.svg`;
    const a = document.createElement("a");
    a.href = image.blobUrl;
    a.download = filename;
    a.click();
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

  function handleSameYearCycle(delta: 1 | -1) {
    if (previewList.length === 0) return;
    const currentYear = previewList[previewIndex].year;
    const sameYear = previewList
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.year === currentYear);
    if (sameYear.length === 0) return;
    const pos = sameYear.findIndex(({ i }) => i === previewIndex);
    const next = sameYear[(pos + delta + sameYear.length) % sameYear.length];
    navigatePreview(next.i);
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
    | { kind: "bookmark-cycle"; delta: -1 | 1 }
    | { kind: "add-page" }
    | { kind: "auto-set-corners" }
    | { kind: "clear-page" }
    | { kind: "download-page" }
    | { kind: "preview-cycle"; delta: -1 | 1 }
    | { kind: "move-entry"; delta: -1 | 1 }
    | { kind: "remove-entry" }
    | { kind: "prev-entry" }
    | { kind: "open-in-picker" }
    | { kind: "set-align"; edge: AlignEdge }
    | { kind: "same-year-cycle"; delta: -1 | 1 };

  function keyToAction(
    key: string,
    mode: "picker" | "preview",
  ): Action | undefined {
    if (key === "h") return { kind: "tab-step", delta: -1 };
    if (key === "l") return { kind: "tab-step", delta: 1 };
    if (key === "+") return { kind: "zoom-step", delta: 1 };
    if (key === "-") return { kind: "zoom-step", delta: -1 };
    if (mode === "picker") {
      if (key === "j") return { kind: "bookmark-cycle", delta: 1 };
      if (key === "k") return { kind: "bookmark-cycle", delta: -1 };
      if (key === "a") return { kind: "add-page" };
      if (key === "q") return { kind: "auto-set-corners" };
      if (key === "w") return { kind: "download-page" };
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
      if (key === "w") return { kind: "same-year-cycle", delta: 1 };
      if (key === "b") return { kind: "same-year-cycle", delta: -1 };
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
      case "bookmark-cycle":
        handleBookmarkCycle(action.delta);
        break;
      case "add-page":
        handleAddCurrentPage();
        break;
      case "auto-set-corners":
        handleAutoSetCorners();
        break;
      case "clear-page":
        handleClearPage();
        break;
      case "download-page":
        handleDownloadPage();
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
      case "same-year-cycle":
        handleSameYearCycle(action.delta);
        break;
      default:
        unreachable(action);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet cornerMarker(corner: Corner, color: string)}
  <div
    class="corner-marker"
    style="background: {color}; transform: translate(calc({corner.x *
      scale}px - var(--size) / 2), calc({corner.y *
      scale}px - var(--size) / 2));"
  ></div>
{/snippet}

{#snippet snapIndicator(c: { x: number; y: number })}
  <div
    class="snap-indicator"
    style="transform: translate(calc({c.x *
      scale}px - var(--size) / 2), calc({c.y * scale}px - var(--size) / 2));"
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
    <a href={resolve("/help")} class="help-link">ヘルプ</a>
  </header>

  {#if mode === "picker"}
    {@const tl = picker.corners[picker.page]?.topLeft}
    {@const br = picker.corners[picker.page]?.bottomRight}

    <div class="controls">
      <label>
        拡大
        <input type="range" min="0.1" max="10" step="0.1" bind:value={scale} />
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
          onkeydown={(e) => e.key === "Escape" && e.currentTarget.blur()}
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
          onclick={handleDownloadPage}
          title="ダウンロード (w)"
        >
          ダウンロード
        </button>
        <button
          class="btn"
          onclick={handleAutoSetCorners}
          disabled={!currentImage}
          title="角を自動設定 (q)"
        >
          角を自動設定
        </button>
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
      <div class="controls-group">
        <button
          class="btn"
          onclick={handleOpenInVenusaur}
          disabled={!currentImage}
        >
          フシギバナで開く
        </button>
      </div>
    </div>

    <div class="info">
      {#if !(tl && br)}<span>次のクリック: {!tl ? "1点目" : "2点目"}</span>{/if}
      <span>
        左上: {tl ? `(${tl.x.toFixed(1)}, ${tl.y.toFixed(1)})` : "—"}
      </span>
      <span>
        右下: {br ? `(${br.x.toFixed(1)}, ${br.y.toFixed(1)})` : "—"}
      </span>
    </div>

    <aside class="sidebar">
      {#each pickerBookmarks as bookmark}
        <div
          class="chip"
          aria-current={bookmark.page === picker.page ? "true" : undefined}
          data-year={year}
          onclick={() => pickerSetPage(picker, bookmark.page)}
        >
          <span>
            p.{bookmark.page}
            {bookmark.names.map((n) => MAJOR_TO_JA[n]).join(", ")}
          </span>
        </div>
      {/each}
    </aside>

    <div
      class="viewer"
      bind:this={pickerViewer}
      onmousemove={(e) => handleMouseMoveThrottled.call(e)}
    >
      {#if browser && currentImage}
        <img
          src={currentImage.blobUrl}
          alt="{picker.page}ページ目"
          width={currentImage.viewBox.w * scale}
          height={currentImage.viewBox.h * scale}
          style={tl && br ? "cursor: default;" : undefined}
          onclick={handleClick}
        />
      {/if}
      {#if snapCorner && !(tl && br)}{@render snapIndicator(snapCorner)}{/if}
      {#if tl}{@render cornerMarker(tl, "rgba(255, 0, 0, 0.5)")}{/if}
      {#if br}{@render cornerMarker(br, "rgba(0, 200, 0, 0.5)")}{/if}
    </div>
  {:else}
    <div class="controls">
      <label>
        拡大
        <input type="range" min="0.1" max="10" step="0.1" bind:value={scale} />
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
          data-year={entry.year}
          onclick={() => navigatePreview(index)}
        >
          <span>
            {entry.year} p.{entry.page}{#if YEAR_TO_PAGE_TO_MAJORS[entry.year][entry.page]}{" "}{YEAR_TO_PAGE_TO_MAJORS[
                entry.year
              ]
                [entry.page]!.map((n) => MAJOR_TO_JA[n])
                .join(", ")}{/if}
          </span>
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

    <div class="viewer" bind:this={previewViewer}>
      {#if browser && currentImage}
        {@const currentTransform = alignTransforms[previewIndex]}
        {#if currentTransform}
          {@const { sx, tx, ty } = currentTransform}
          <img
            src={currentImage.blobUrl}
            alt="{previewList[previewIndex].year}年{previewList[previewIndex]
              .page}ページ目"
            width={currentImage.viewBox.w * sx * scale}
            height={currentImage.viewBox.h * sx * scale}
            style="top: {(16 + ty) * scale}px; left: {(16 + tx) * scale}px;"
          />
        {/if}
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
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto auto 1fr;
    grid-template-areas:
      "header   header"
      "controls controls"
      "sidebar  info"
      "sidebar  viewer";
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
  [data-mode="preview"] .viewer > img {
    position: absolute;
    pointer-events: none;
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

    .help-link {
      margin-left: auto;
      color: $color-accent;
      text-decoration: none;
      font-size: 14px;
      &:hover {
        text-decoration: underline;
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

    .corner-marker,
    .snap-indicator {
      position: absolute;
      top: 0;
      left: 0;
      width: var(--size);
      height: var(--size);
      border-radius: 50%;
      pointer-events: none;
    }

    .corner-marker {
      --size: #{$marker-size};
    }

    .snap-indicator {
      --size: 16px;
      background: rgba(37, 99, 235, 0.25);
      border: 2px solid #2563eb;
      box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.4);
      box-sizing: border-box;
    }
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
    max-width: 220px;
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

    $l: 98%;
    $c: 8%;
    &[data-year="2023"] {
      background-color: oklch($l $c 0);
    }
    &[data-year="2024"] {
      background-color: oklch($l $c 120);
    }
    &[data-year="2025"] {
      background-color: oklch($l $c 240);
    }

    &[aria-current="true"] {
      outline: 2px solid $color-accent;
      outline-offset: 1px;
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
