import BN from "bn.js";
import {
  formatLamports,
  slotsToDuration,
  priceFromReserves,
  applyChirigiwaPenalty,
  isqrtBN,
} from "../utils";

describe("formatLamports", () => {
  test("formats whole token amounts", () => {
    expect(formatLamports(new BN(1_000_000), 6)).toBe("1");
  });
  test("formats fractional amounts", () => {
    expect(formatLamports(new BN(1_500_000), 6)).toBe("1.5");
  });
  test("trims trailing zeros", () => {
    expect(formatLamports(new BN(1_230_000), 6)).toBe("1.23");
  });
});

describe("slotsToDuration", () => {
  test("converts 100 slots to ~40 seconds", () => {
    const d = slotsToDuration(100);
    expect(d.seconds).toBeCloseTo(40, 0);
  });
  test("days conversion is consistent", () => {
    const d = slotsToDuration(216_000);
    expect(d.hours).toBeCloseTo(24, 0);
  });
});

describe("priceFromReserves", () => {
  test("returns zero when denominator is zero", () => {
    expect(priceFromReserves(new BN(1000), new BN(0)).toNumber()).toBe(0);
  });
  test("returns Q64-scaled ratio", () => {
    const p = priceFromReserves(new BN(2000), new BN(1000));
    expect(p.shrn(64).toNumber()).toBe(2);
  });
});

describe("applyChirigiwaPenalty", () => {
  test("default 5% penalty", () => {
    expect(applyChirigiwaPenalty(new BN(10_000)).toNumber()).toBe(9500);
  });
  test("custom penalty", () => {
    expect(applyChirigiwaPenalty(new BN(10_000), 1000).toNumber()).toBe(9000);
  });
});

describe("isqrtBN", () => {
  test("returns 0 for 0", () => {
    expect(isqrtBN(new BN(0)).toNumber()).toBe(0);
  });
  test("returns 1 for 1", () => {
    expect(isqrtBN(new BN(1)).toNumber()).toBe(1);
  });
  test("returns 10 for 100", () => {
    expect(isqrtBN(new BN(100)).toNumber()).toBe(10);
  });
  test("returns floor(sqrt(n)) for non-square inputs", () => {
    expect(isqrtBN(new BN(99)).toNumber()).toBe(9);
  });
  test("handles large u128 values", () => {
    const big = new BN(10).pow(new BN(20));
    const root = isqrtBN(big);
    expect(root.mul(root).lte(big)).toBe(true);
  });
});
