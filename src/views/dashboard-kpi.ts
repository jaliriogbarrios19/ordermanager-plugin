import { formatCurrency } from "../utils/currency";

export function addKPI(
  container: HTMLElement,
  label: string,
  value: number,
  currency: string,
  colorClass: string = "neutral",
  onClick?: () => void
): void {
  const card = container.createDiv({ cls: "ordermanager-kpi-card" });
  if (onClick) {
    card.setCssProps({ cursor: "pointer" });
    card.onclick = onClick;
  }
  card.createEl("div", { text: label, cls: "ordermanager-kpi-label" });
  const valueEl = card.createEl("p", {
    cls: `ordermanager-kpi-value ${colorClass}`,
  });
  valueEl.setText(formatCurrency(value, currency));
}
