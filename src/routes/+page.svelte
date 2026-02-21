<script lang="ts">
  import { browser } from "$app/environment";

  const PAGE_COUNTS = { 2023: 118, 2024: 121, 2025: 125 } as const;
  type Year = keyof typeof PAGE_COUNTS;
  const YEARS = [2023, 2024, 2025] as const;

  function isYear(v: unknown): v is Year {
    return v === 2023 || v === 2024 || v === 2025;
  }

  type Corner = { x: number; y: number };

  function cornerDecode(u: unknown): Corner | undefined {
    if (u === null || u === undefined) return undefined;
    if (typeof u !== "object") return undefined;
    const o = u as Record<string, unknown>;
    if (typeof o.x !== "number" || typeof o.y !== "number") return undefined;
    return { x: o.x, y: o.y };
  }

  type NextClick = "top-left" | "bottom-right";

  function nextClickToJa(n: NextClick): string {
    return n === "top-left" ? "左上" : "右下";
  }

  type Picker = {
    page: number;
    topLeft: Corner | undefined;
    bottomRight: Corner | undefined;
    nextClick: NextClick;
  };

  function pickerDefault(): Picker {
    return {
      page: 1,
      topLeft: undefined,
      bottomRight: undefined,
      nextClick: "top-left",
    };
  }

  function pickerCanPreview(p: Picker): boolean {
    return p.topLeft !== undefined && p.bottomRight !== undefined;
  }

  function pickerDecode(u: unknown, year: Year): Picker | undefined {
    if (typeof u !== "object" || u === null) return undefined;
    const o = u as Record<string, unknown>;
    if (typeof o.page !== "number" || !Number.isInteger(o.page))
      return undefined;
    if (o.page < 1 || o.page > PAGE_COUNTS[year]) return undefined;
    if (o.nextClick !== "top-left" && o.nextClick !== "bottom-right")
      return undefined;
    const topLeft = cornerDecode(o.topLeft);
    const bottomRight = cornerDecode(o.bottomRight);
    if (o.topLeft !== undefined && o.topLeft !== null && topLeft === undefined)
      return undefined;
    if (
      o.bottomRight !== undefined &&
      o.bottomRight !== null &&
      bottomRight === undefined
    )
      return undefined;
    return { page: o.page, topLeft, bottomRight, nextClick: o.nextClick };
  }

  function svgUrl(year: Year, page: number): string {
    return `${import.meta.env.BASE_URL}tables/${year}/${String(page).padStart(3, "0")}.svg`;
  }

  type AlignTransform = { tx: number; ty: number; sx: number };

  type Storage = {
    mode: "picker" | "preview";
    year: Year;
    scale: number;
    pickers: Record<Year, Picker>;
    previewYear: Year;
  };

  function storageDefault(): Storage {
    return {
      mode: "picker",
      year: 2023,
      scale: 1.0,
      pickers: {
        2023: pickerDefault(),
        2024: pickerDefault(),
        2025: pickerDefault(),
      },
      previewYear: 2023,
    };
  }

  function storageEncode(s: Storage): string {
    return JSON.stringify(s);
  }

  function storageDecode(u: unknown): Storage | undefined {
    if (typeof u !== "object" || u === null) return undefined;
    const o = u as Record<string, unknown>;
    if (o.mode !== "picker" && o.mode !== "preview") return undefined;
    if (!isYear(o.year)) return undefined;
    if (typeof o.scale !== "number") return undefined;
    if (typeof o.pickers !== "object" || o.pickers === null) return undefined;
    const rawPickers = o.pickers as Record<string, unknown>;
    const entries = YEARS.map(
      (y) => [y, pickerDecode(rawPickers[String(y)], y)] as const,
    );
    if (entries.some(([, p]) => p === undefined)) return undefined;
    const pickers = Object.fromEntries(entries) as Record<Year, Picker>;
    if (!isYear(o.previewYear)) return undefined;
    return {
      mode: o.mode,
      year: o.year,
      scale: o.scale,
      pickers,
      previewYear: o.previewYear,
    };
  }

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

  const initial = storageLoad();
  let mode = $state(initial.mode);
  let year = $state(initial.year);
  let scale = $state(initial.scale);
  let pickers = $state(initial.pickers);
  let previewYear = $state(initial.previewYear);

  $effect(() => {
    if (!browser) return;
    localStorage.setItem(
      STORAGE_KEY,
      storageEncode({ mode, year, scale, pickers, previewYear }),
    );
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
      const rcw = ref.bottomRight!.x - ref.topLeft!.x;

      function compute(p: Picker): AlignTransform | undefined {
        if (!p.topLeft || !p.bottomRight) return undefined;
        const sx = rcw / (p.bottomRight.x - p.topLeft.x);
        return { tx: -sx * p.topLeft.x, ty: -sx * p.topLeft.y, sx };
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

  function pickerResetCorners(p: Picker) {
    p.topLeft = undefined;
    p.bottomRight = undefined;
    p.nextClick = "top-left";
  }

  function handleClick(e: MouseEvent) {
    const x = e.offsetX / scale;
    const y = e.offsetY / scale;
    if (picker.nextClick === "top-left") {
      picker.topLeft = { x, y };
      picker.nextClick = "bottom-right";
    } else {
      picker.bottomRight = { x, y };
      picker.nextClick = "top-left";
    }
  }

  function handlePageInput(e: Event & { currentTarget: HTMLInputElement }) {
    const value = e.currentTarget.valueAsNumber;
    if (!Number.isInteger(value) || value < 1 || value > PAGE_COUNTS[year])
      return;
    picker.page = value;
    pickerResetCorners(picker);
  }

  function enterPreview() {
    mode = "preview";
    if (!pickerCanPreview(pickers[previewYear])) {
      const first = YEARS.find((y) => pickerCanPreview(pickers[y]));
      if (first !== undefined) previewYear = first;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (mode !== "preview") return;
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement &&
      active.type !== "radio" &&
      active.type !== "range"
    )
      return;
    for (const y of YEARS) {
      if (e.key === String(y % 10) && pickerCanPreview(pickers[y])) {
        previewYear = y;
        break;
      }
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
      <button onclick={() => selectYear(2023)}>2023</button>
      <button onclick={() => selectYear(2024)}>2024</button>
      <button onclick={() => selectYear(2025)}>2025</button>
      <button onclick={enterPreview}>プレビュー</button>
    </nav>
  </header>

  <div>
    {#if mode === "picker"}
      <div>
        <label>
          ページ
          <input
            type="number"
            min="1"
            max={PAGE_COUNTS[year]}
            value={picker.page}
            oninput={handlePageInput}
          />
        </label>
        <label>
          拡大
          <input type="range" min="0.1" max="4" step="0.1" bind:value={scale} />
          {scale.toFixed(1)}
        </label>
      </div>

      <div>
        <span>次のクリック: {nextClickToJa(picker.nextClick)}</span>
        <span>
          左上: {picker.topLeft
            ? `(${picker.topLeft.x.toFixed(1)}, ${picker.topLeft.y.toFixed(1)})`
            : "—"}
        </span>
        <span>
          右下: {picker.bottomRight
            ? `(${picker.bottomRight.x.toFixed(1)}, ${picker.bottomRight.y.toFixed(1)})`
            : "—"}
        </span>
      </div>

      <div class="viewer">
        <img
          src={svgUrl(year, picker.page)}
          alt="{picker.page}ページ目"
          style="width: {scale * 100}%;"
          onclick={handleClick}
        />
        {#if picker.topLeft}
          {@render cornerMarker(picker.topLeft, "rgba(255, 0, 0, 0.5)")}
        {/if}
        {#if picker.bottomRight}
          {@render cornerMarker(picker.bottomRight, "rgba(0, 200, 0, 0.5)")}
        {/if}
      </div>
    {:else}
      <div>
        <label>
          拡大
          <input type="range" min="0.1" max="4" step="0.1" bind:value={scale} />
          {scale.toFixed(1)}
        </label>
      </div>

      <div>
        {#each YEARS as y}
          <label>
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

      <div class="viewer">
        {#each previewItems as { y, t }}
          <img
            src={svgUrl(y, pickers[y].page)}
            alt="{y}年{pickers[y].page}ページ目"
            style="transform: translate({t.tx * scale}px, {t.ty *
              scale}px) scale({t.sx * scale}); opacity: {previewYear === y
              ? 1
              : 0};"
          />
        {/each}
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
    gap: $sp-md;
    padding: $sp-sm $sp-md;

    h1 {
      margin: 0;
      font-size: $font-h1;
      img {
        height: 1em;
        vertical-align: middle;
      }
    }

    nav {
      display: flex;
      gap: $sp-sm;
    }
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
