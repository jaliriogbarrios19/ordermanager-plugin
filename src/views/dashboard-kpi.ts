import { formatCurrency } from "../utils/currency";

export function addKPI(
  container: HTMLElement,
  label: string,
  value: number,
  currency: string,
  colorClass: string = "neutral"
): void {
  const card = container.createDiv({ cls: "ordermanager-kpi-card" });
  card.createEl("h3", { text: label });
  const valueEl = card.createEl("p", {
    cls: `ordermanager-kpi-value ${colorClass}`,
  });
  valueEl.setText(formatCurrency(value, currency));
}
