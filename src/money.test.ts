import { describe, expect, test } from "bun:test";
import { addCents, formatCents } from "./money";

describe("addCents", () => {
  test("adds whole minor units", () => {
    expect(addCents(25000, 25000)).toBe(50000);
  });

  test("refuses fractions", () => {
    expect(() => addCents(0.5, 1)).toThrow(RangeError);
  });

  test("refuses overflow", () => {
    expect(() => addCents(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });

  test("is commutative and has zero as identity across a range", () => {
    for (let left = -50_000; left <= 50_000; left += 7_919) {
      for (let right = -50_000; right <= 50_000; right += 6_007) {
        expect(addCents(left, right)).toBe(addCents(right, left));
      }
      expect(addCents(left, 0)).toBe(left);
    }
  });
});

describe("formatCents", () => {
  test("formats dollars", () => {
    expect(formatCents(25000)).toBe("$250.00");
    expect(formatCents(0)).toBe("$0.00");
  });

  test("formats a negative amount", () => {
    expect(formatCents(-120)).toBe("-$1.20");
  });

  test("refuses fractions", () => {
    expect(() => formatCents(1.5)).toThrow(RangeError);
  });
});
