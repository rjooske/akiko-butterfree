export function assert(b: boolean): asserts b {
  if (!b) {
    throw new Error("Assertion failed");
  }
}

export function unreachable(_: never): never {
  throw new Error("Should be unreachable");
}

export function sortByKeyCached<T>(ts: T[], getKey: (t: T) => number): void {
  const pairs: [number, T][] = [];
  for (const t of ts) {
    pairs.push([getKey(t), t]);
  }
  pairs.sort(([a], [b]) => a - b);
  for (let i = 0; i < ts.length; i++) {
    ts[i] = pairs[i][1];
  }
}
