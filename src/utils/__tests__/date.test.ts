import { describe, it, expect } from "vitest";
import { today, monthStart, monthEnd } from "../date";

describe("today", () => {
  it("returns today in YYYY-MM-DD", () => {
    const result = today();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const expected = new Date().toISOString().split("T")[0];
    expect(result).toBe(expected);
  });
});

describe("monthStart", () => {
  it("returns first day of current month", () => {
    const result = monthStart();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    expect(result).toBe(expected);
  });
});

describe("monthEnd", () => {
  it("returns last day of current month", () => {
    const result = monthEnd();
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const expected = lastDay.toISOString().split("T")[0];
    expect(result).toBe(expected);
  });
});
