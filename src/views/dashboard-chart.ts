import type { TransaccionData } from "../types";
import type { TFile } from "obsidian";

interface Bucket {
  label: string;
  start: string;
  end: string;
}

export function renderChart(
  chartContainer: HTMLElement,
  transacciones: Array<{ file: TFile; data: TransaccionData }>,
  rRates: Record<string, number>,
  rRef: string,
  desde: string,
  hasta: string,
  periodLabel: string,
  convertir: (amount: number, from: string, rates: Record<string, number>, to: string) => number
): void {
  const diffDays = Math.ceil((new Date(hasta + "T00:00:00").getTime() - new Date(desde + "T00:00:00").getTime()) / 86400000);
  if (diffDays <= 1) return;

  const buckets: Bucket[] = [];
  if (diffDays <= 31) {
    for (let d = new Date(desde + "T00:00:00"); d <= new Date(hasta + "T00:00:00"); d.setDate(d.getDate() + 7)) {
      const s = d.toISOString().split("T")[0];
      const e = new Date(d);
      e.setDate(e.getDate() + 6);
      const eStr = e > new Date(hasta + "T00:00:00") ? hasta : e.toISOString().split("T")[0];
      buckets.push({ label: d.toLocaleDateString("es", { day: "numeric", month: "short" }), start: s, end: eStr });
    }
  } else {
    const start = new Date(desde + "T00:00:00");
    const end = new Date(hasta + "T00:00:00");
    while (start <= end) {
      const mStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
      const mEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0).toISOString().split("T")[0];
      const actualEnd = mEnd > hasta ? hasta : mEnd;
      buckets.push({ label: start.toLocaleDateString("es", { month: "short" }), start: mStart, end: actualEnd });
      start.setMonth(start.getMonth() + 1);
    }
  }
  if (buckets.length < 2) return;

  const chartEl = chartContainer.createDiv();
  chartEl.style.margin = "16px 0";
  chartEl.createEl("div", { cls: "ordermanager-section-title", text: periodLabel });

  const data = buckets.map((b) => {
    const ing = transacciones
      .filter((t) => t.data.clase === "ingreso" && t.data.fecha >= b.start && t.data.fecha <= b.end)
      .reduce((s, t) => s + (t.data.monto_referencia || convertir(t.data.monto || 0, t.data.moneda || "USD", rRates, rRef)), 0);
    const egr = transacciones
      .filter((t) => t.data.clase === "egreso" && t.data.fecha >= b.start && t.data.fecha <= b.end)
      .reduce((s, t) => s + (t.data.monto_referencia || convertir(t.data.monto || 0, t.data.moneda || "USD", rRates, rRef)), 0);
    return { label: b.label, ing, egr };
  });

  const maxVal = Math.max(...data.map((d) => Math.max(d.ing, d.egr)), 1);
  const w = 360, h = 140, pad = 40, barW = Math.max(8, Math.min(16, Math.floor((w - pad * 2) / (buckets.length * 2.5))));
  const gap = Math.floor((w - pad * 2 - barW * 2 * buckets.length) / buckets.length);

  const svg = activeDocument.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.style.width = "100%";
  svg.style.maxWidth = "400px";
  svg.style.marginTop = "8px";
  chartEl.appendChild(svg as unknown as Node);

  data.forEach((d, i) => {
    const x = pad + i * (barW * 2 + gap);
    const ingH = (d.ing / maxVal) * (h - pad - 10);
    const egrH = (d.egr / maxVal) * (h - pad - 10);

    const ingRect = activeDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
    ingRect.setAttribute("x", String(x));
    ingRect.setAttribute("y", String(h - pad - ingH));
    ingRect.setAttribute("width", String(barW));
    ingRect.setAttribute("height", String(Math.max(ingH, 0)));
    ingRect.setAttribute("fill", "var(--color-green)");
    ingRect.setAttribute("rx", "2");
    svg.appendChild(ingRect);

    const egrRect = activeDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
    egrRect.setAttribute("x", String(x + barW + 2));
    egrRect.setAttribute("y", String(h - pad - egrH));
    egrRect.setAttribute("width", String(barW));
    egrRect.setAttribute("height", String(Math.max(egrH, 0)));
    egrRect.setAttribute("fill", "var(--color-red)");
    egrRect.setAttribute("rx", "2");
    svg.appendChild(egrRect);

    const label = activeDocument.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(x + barW));
    label.setAttribute("y", String(h - 5));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", "var(--text-muted)");
    label.setAttribute("font-size", "9");
    label.textContent = d.label;
    svg.appendChild(label);
  });

  const leyenda = chartEl.createDiv();
  leyenda.addClass("ordermanager-flex-row");
  leyenda.style.gap = "16px";
  leyenda.style.fontSize = "0.75em";
  leyenda.addClass("ordermanager-text-muted");
  leyenda.style.marginTop = "4px";
  const ingLeg = leyenda.createEl("span");
  ingLeg.createSpan({ text: "■", attr: { style: "color:var(--color-green);" } });
  ingLeg.createSpan({ text: " Ingresos" });
  const egrLeg = leyenda.createEl("span");
  egrLeg.createSpan({ text: "■", attr: { style: "color:var(--color-red);" } });
  egrLeg.createSpan({ text: " Egresos" });
}
