import { describe, it, expect } from "vitest";
import { formatCurrency } from "../currency";

describe("formatCurrency", () => {
  it("formats a positive number", () => {
    const result = formatCurrency(1234.56, "USD");
    expect(result).toContain("USD");
    expect(result).toContain("1.234,56");
  });

  it("formats zero", () => {
    const result = formatCurrency(0, "USD");
    expect(result).toContain("0,00");
  });

  it("formats negative", () => {
    const result = formatCurrency(-500, "USD");
    expect(result).toContain("500,00");
  });

  it("includes currency code in output", () => {
    expect(formatCurrency(100, "VES")).toContain("VES");
    expect(formatCurrency(100, "EUR")).toContain("EUR");
    expect(formatCurrency(100, "BTC")).toContain("BTC");
  });

  it("returns non-empty string", () => {
    expect(formatCurrency(42, "USD").length).toBeGreaterThan(0);
  });
});
