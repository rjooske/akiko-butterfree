import { describe, expect, it } from "vitest";
import {
  type Storage,
  storageDecode,
  storageDefault,
  storageEncode,
} from "./storage";

describe("round-trip", () => {
  it("decodes an encoded Storage back to the same value", () => {
    const original: Storage = {
      mode: "preview",
      year: 2024,
      scale: 2.5,
      previewList: [{ year: 2024, page: 7 }, { year: 2023, page: 42 }],
      previewIndex: 1,
      alignEdge: "bottom",
      pickers: {
        2023: {
          page: 42,
          corners: {
            42: {
              topLeft: { x: 10.5, y: 20.3 },
              bottomRight: undefined,
            },
          },
        },
        2024: {
          page: 7,
          corners: {
            7: {
              topLeft: { x: 5, y: 15 },
              bottomRight: { x: 300, y: 400 },
            },
            8: {
              topLeft: { x: 6, y: 16 },
              bottomRight: { x: 301, y: 401 },
            },
          },
        },
        2025: {
          page: 1,
          corners: {},
        },
      },
    };
    const decoded = storageDecode(JSON.parse(storageEncode(original)));
    expect(decoded).toEqual(original);
  });
});

describe("storageDecode malformed input", () => {
  it.each([
    ["empty object", "{}"],
    ["null", "null"],
    ["wrong mode", JSON.stringify({ ...storageDefault(), mode: "other" })],
    ["missing mode", JSON.stringify({ ...storageDefault(), mode: undefined })],
    ["invalid year", JSON.stringify({ ...storageDefault(), year: 2000 })],
    ["scale is string", JSON.stringify({ ...storageDefault(), scale: "1.0" })],
    [
      "missing pickers",
      JSON.stringify({ ...storageDefault(), pickers: undefined }),
    ],
    ["invalid previewList entry",
      JSON.stringify({ ...storageDefault(), previewList: [{ year: 9999, page: 1 }] })],
    ["previewIndex out of range (empty list)",
      JSON.stringify({ ...storageDefault(), previewList: [], previewIndex: 1 })],
    ["previewIndex out of range (non-empty list)",
      JSON.stringify({ ...storageDefault(), previewList: [{ year: 2023, page: 1 }], previewIndex: 1 })],
    [
      "picker page out of range",
      JSON.stringify({
        ...storageDefault(),
        pickers: {
          ...storageDefault().pickers,
          2023: { ...storageDefault().pickers[2023], page: 9999 },
        },
      }),
    ],
    [
      "corner x is not a number",
      JSON.stringify({
        ...storageDefault(),
        pickers: {
          ...storageDefault().pickers,
          2024: {
            ...storageDefault().pickers[2024],
            corners: { 1: { topLeft: { x: "bad", y: 0 }, bottomRight: null } },
          },
        },
      }),
    ],
  ])("returns undefined for %s", (_label, json) => {
    expect(storageDecode(JSON.parse(json))).toBeUndefined();
  });
});
