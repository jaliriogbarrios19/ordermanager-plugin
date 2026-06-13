import { formatCurrency } from "../utils/currency";
import { convertir, getRatesForDate } from "../utils/exchange";
import type { DeudaData } from "../types";

export function renderDebtSummaryCards(
  container: HTMLElement,
  deudas: Array<{ data: DeudaData }>,
  defaultCurrency: string,
  ref: string,
  rates: Record<string, number>,
  histRates: Record<string, Record<string, number>>
): void {
  const deudoresMap = new Map<string, number>();
  const acreedoresMap = new Map<string, number>();
  for (const d of deudas) {
    if (d.data.estado === "pagada") continue;
    const restante = (d.data.monto_total || 0) - (d.data.monto_pagado || 0);
    if (restante <= 0) continue;

    let montoRef: number;
    if (d.data.monto_referencia) {
      const pagadoRef = d.data.monto_pagado
        ? convertir(d.data.monto_pagado, d.data.moneda || "USD", getRatesForDate(d.data.fecha_inicio || "", histRates, rates), ref)
        : 0;
      montoRef = (d.data.monto_referencia || 0) - pagadoRef;
    } else {
      const debtRates = getRatesForDate(d.data.fecha_inicio || "", histRates, rates);
      montoRef = convertir(restante, d.data.moneda || "USD", debtRates, ref);
    }

    if (d.data.clase === "a_favor" && d.data.cliente) {
      deudoresMap.set(d.data.cliente, (deudoresMap.get(d.data.cliente) || 0) + montoRef);
    } else if (d.data.clase === "en_contra" && d.data.proveedor) {
      acreedoresMap.set(d.data.proveedor, (acreedoresMap.get(d.data.proveedor) || 0) + montoRef);
    }
  }

  if (deudoresMap.size === 0 && acreedoresMap.size === 0) return;

  const summaryDiv = container.createDiv();
  summaryDiv.setCssProps({display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap"});

  if (deudoresMap.size > 0) {
    const card = summaryDiv.createDiv();
    card.setCssProps({
      flex: "1",
      minWidth: "280px",
      border: "1px solid var(--background-modifier-border)",
      borderRadius: "8px",
      padding: "12px",
      background: "var(--background-secondary)",
    });
    const heading1 = card.createSpan({ text: "Quiénes me deben" });
    heading1.setCssProps({display: "block", margin: "0 0 8px 0", color: "var(--color-green)", fontSize: "0.9em", fontWeight: "600"});
    const sortedDeudores = [...deudoresMap.entries()].sort((a, b) => b[1] - a[1]);
    for (const [nombre, monto] of sortedDeudores) {
      const row = card.createDiv();
      row.setCssProps({
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        borderBottom: "1px solid var(--background-modifier-border)",
        fontSize: "0.85em",
      });
      row.createSpan({ text: nombre });
      row.createSpan({ text: formatCurrency(monto, ref) });
    }
  }

  if (acreedoresMap.size > 0) {
    const card = summaryDiv.createDiv();
    card.setCssProps({
      flex: "1",
      minWidth: "280px",
      border: "1px solid var(--background-modifier-border)",
      borderRadius: "8px",
      padding: "12px",
      background: "var(--background-secondary)",
    });
    const heading2 = card.createSpan({ text: "A quiénes les debo" });
    heading2.setCssProps({display: "block", margin: "0 0 8px 0", color: "var(--color-red)", fontSize: "0.9em", fontWeight: "600"});
    const sortedAcreedores = [...acreedoresMap.entries()].sort((a, b) => b[1] - a[1]);
    for (const [nombre, monto] of sortedAcreedores) {
      const row = card.createDiv();
      row.setCssProps({
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        borderBottom: "1px solid var(--background-modifier-border)",
        fontSize: "0.85em",
      });
      row.createSpan({ text: nombre });
      row.createSpan({ text: formatCurrency(monto, ref) });
    }
  }
}
