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
    const p = o.pickers as Record<string, unknown>;
    const picker2023 = pickerDecode(p["2023"], 2023);
    const picker2024 = pickerDecode(p["2024"], 2024);
    const picker2025 = pickerDecode(p["2025"], 2025);
    if (!picker2023 || !picker2024 || !picker2025) return undefined;
    if (!isYear(o.previewYear)) return undefined;
    return {
      mode: o.mode,
      year: o.year,
      scale: o.scale,
      pickers: { 2023: picker2023, 2024: picker2024, 2025: picker2025 },
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
  let svgUrl = $derived(
    `${import.meta.env.BASE_URL}tables/${year}/${String(picker.page).padStart(3, "0")}.svg`,
  );

  let canPreview = $derived({
    2023:
      pickers[2023].topLeft !== undefined &&
      pickers[2023].bottomRight !== undefined,
    2024:
      pickers[2024].topLeft !== undefined &&
      pickers[2024].bottomRight !== undefined,
    2025:
      pickers[2025].topLeft !== undefined &&
      pickers[2025].bottomRight !== undefined,
  });

  // For each year, compute a CSS transform that brings topLeft to (0,0) and
  // normalises content width to match the reference year. Bake scale in later.
  let alignTransforms = $derived.by(
    (): Record<Year, AlignTransform | undefined> => {
      const refYear = YEARS.find((y) => canPreview[y]);
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
    if (!Number.isInteger(value) || value < 1 || value > PAGE_COUNTS[year]) return;
    picker.page = value;
    picker.topLeft = undefined;
    picker.bottomRight = undefined;
    picker.nextClick = "top-left";
  }

  function enterPreview() {
    mode = "preview";
    if (!canPreview[previewYear]) {
      const first = YEARS.find((y) => canPreview[y]);
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
      if (e.key === String(y % 10) && canPreview[y]) {
        previewYear = y;
        break;
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<h1>
  <img src="" alt="あきこバタフリー" />
  <span>あきこバタフリー</span>
</h1>

<div>
  <button onclick={() => selectYear(2023)}>2023</button>
  <button onclick={() => selectYear(2024)}>2024</button>
  <button onclick={() => selectYear(2025)}>2025</button>
  <button onclick={enterPreview}>プレビュー</button>
</div>

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
    <span>
      次のクリック: {nextClickToJa(picker.nextClick)}
    </span>
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

  <div style="width: 100%; height: 80vh; overflow: auto; position: relative;">
    <img
      src={svgUrl}
      alt="{picker.page}ページ目"
      style="width: {scale * 100}%; display: block; cursor: crosshair;"
      onclick={handleClick}
    />
    {#if picker.topLeft}
      <div
        style="position: absolute; top: 0; left: 0; width: 10px; height: 10px; background: rgba(255, 0, 0, 0.5); border-radius: 50%; transform: translate(calc({picker
          .topLeft.x * scale}px - 5px), calc({picker.topLeft.y *
          scale}px - 5px)); pointer-events: none;"
      ></div>
    {/if}
    {#if picker.bottomRight}
      <div
        style="position: absolute; top: 0; left: 0; width: 10px; height: 10px; background: rgba(0, 200, 0, 0.5); border-radius: 50%; transform: translate(calc({picker
          .bottomRight.x * scale}px - 5px), calc({picker.bottomRight.y *
          scale}px - 5px)); pointer-events: none;"
      ></div>
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
          disabled={!canPreview[y]}
        />
        {y}
      </label>
    {/each}
  </div>

  <div style="width: 100%; height: 80vh; overflow: auto; position: relative;">
    {#each previewItems as { y, t }}
      <img
        src={`${import.meta.env.BASE_URL}tables/${y}/${String(pickers[y].page).padStart(3, "0")}.svg`}
        alt="{y}年{pickers[y].page}ページ目"
        style="position: absolute; top: 0; left: 0; width: 100%; transform-origin: 0 0; transform: translate({t.tx *
          scale}px, {t.ty * scale}px) scale({t.sx *
          scale}); opacity: {previewYear === y ? 1 : 0}; pointer-events: none;"
      />
    {/each}
  </div>
{/if}

