export const PAGE_COUNTS = { 2023: 118, 2024: 121, 2025: 125, 2026: 127 } as const;
export type Year = keyof typeof PAGE_COUNTS;
export const YEARS = [2023, 2024, 2025, 2026] as const;

function isYear(v: unknown): v is Year {
  return v === 2023 || v === 2024 || v === 2025 || v === 2026;
}

export type Corner = { x: number; y: number };

function cornerDecode(u: unknown): Corner | undefined {
  if (u === null || u === undefined) return undefined;
  if (typeof u !== "object") return undefined;
  const o = u as Record<string, unknown>;
  if (typeof o.x !== "number" || typeof o.y !== "number") return undefined;
  return { x: o.x, y: o.y };
}

type PageCorners = {
  topLeft: Corner | undefined;
  bottomRight: Corner | undefined;
};

function pageCornersDecode(u: unknown): PageCorners | undefined {
  if (typeof u !== "object" || u === null) return undefined;
  const o = u as Record<string, unknown>;
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
  return { topLeft, bottomRight };
}

function cornersDecode(
  u: unknown,
  year: Year,
): Record<number, PageCorners> | undefined {
  if (typeof u !== "object" || u === null) return undefined;
  const o = u as Record<string, unknown>;
  const result: Record<number, PageCorners> = {};
  for (const [key, value] of Object.entries(o)) {
    const pageNum = Number(key);
    if (
      !Number.isInteger(pageNum) ||
      pageNum < 1 ||
      pageNum > PAGE_COUNTS[year]
    )
      return undefined;
    const pc = pageCornersDecode(value);
    if (pc === undefined) return undefined;
    result[pageNum] = pc;
  }
  return result;
}

export type Picker = {
  page: number;
  corners: Record<number, PageCorners>;
};

function pickerDefault(): Picker {
  return {
    page: 1,
    corners: {},
  };
}

function pickerDecode(u: unknown, year: Year): Picker | undefined {
  if (typeof u !== "object" || u === null) return undefined;
  const o = u as Record<string, unknown>;
  if (typeof o.page !== "number" || !Number.isInteger(o.page)) return undefined;
  if (o.page < 1 || o.page > PAGE_COUNTS[year]) return undefined;
  if (typeof o.corners !== "object" || o.corners === null) return undefined;
  const corners = cornersDecode(o.corners, year);
  if (corners === undefined) return undefined;
  return { page: o.page, corners };
}

export type AlignEdge = "top" | "bottom";

export type PreviewEntry = { year: Year; page: number };

function previewEntryDecode(u: unknown): PreviewEntry | undefined {
  if (typeof u !== "object" || u === null) return undefined;
  const o = u as Record<string, unknown>;
  if (!isYear(o.year)) return undefined;
  if (typeof o.page !== "number" || !Number.isInteger(o.page)) return undefined;
  if (o.page < 1 || o.page > PAGE_COUNTS[o.year]) return undefined;
  return { year: o.year, page: o.page };
}

function previewListDecode(u: unknown): PreviewEntry[] | undefined {
  if (!Array.isArray(u)) return undefined;
  const result: PreviewEntry[] = [];
  for (const item of u) {
    const entry = previewEntryDecode(item);
    if (entry === undefined) return undefined;
    result.push(entry);
  }
  return result;
}

export type Storage = {
  mode: "picker" | "preview";
  year: Year;
  scale: number;
  pickers: Record<Year, Picker>;
  previewList: PreviewEntry[];
  previewIndex: number;
  alignEdge: AlignEdge;
};

export function storageDefault(): Storage {
  return {
    mode: "picker",
    year: 2023,
    scale: 1.0,
    pickers: {
      2023: pickerDefault(),
      2024: pickerDefault(),
      2025: pickerDefault(),
      2026: pickerDefault(),
    },
    previewList: [],
    previewIndex: 0,
    alignEdge: "top",
  };
}

export function storageEncode(s: Storage): string {
  return JSON.stringify(s);
}

export function storageDecode(u: unknown): Storage | undefined {
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
  const previewList = previewListDecode(o.previewList);
  if (previewList === undefined) return undefined;
  if (
    typeof o.previewIndex !== "number" ||
    !Number.isInteger(o.previewIndex) ||
    o.previewIndex < 0
  )
    return undefined;
  if (previewList.length === 0) {
    if (o.previewIndex !== 0) return undefined;
  } else {
    if (o.previewIndex > previewList.length - 1) return undefined;
  }
  const alignEdge: AlignEdge = o.alignEdge === "bottom" ? "bottom" : "top";
  return {
    mode: o.mode,
    year: o.year,
    scale: o.scale,
    pickers,
    previewList,
    previewIndex: o.previewIndex as number,
    alignEdge,
  };
}
