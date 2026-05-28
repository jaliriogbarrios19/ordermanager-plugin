export function formatCurrency(amount: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat("es-PY", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: currency === "PYG" ? 0 : 2,
      maximumFractionDigits: currency === "PYG" ? 0 : 2,
    }).format(amount);
  } catch {
    const symbol = currency === "PYG" ? "Gs. " : "$ ";
    return `${symbol}${amount.toLocaleString("es-PY", {
      minimumFractionDigits: currency === "PYG" ? 0 : 2,
      maximumFractionDigits: currency === "PYG" ? 0 : 2,
    })}`;
  }
}

export function parseAmount(value: string): number {
  const cleaned = value.replace(/[^\d,.\-]/g, "").replace(/,/g, "");
  return parseFloat(cleaned) || 0;
}

export function formatInputAmount(amount: number): string {
  return amount.toLocaleString("es-PY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
