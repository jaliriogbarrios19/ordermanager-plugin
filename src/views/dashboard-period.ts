import { App, Notice } from "obsidian";
import type OrderManagerPlugin from "../main";
import { formatCurrency } from "../utils/currency";
import { t as i18n } from "../i18n";
import { convertir } from "../utils/exchange";
import { TransaccionModal } from "../modals/transaccion-modal";
import { TransaccionesModal } from "../modals/transacciones-modal";
import { DeudasModal } from "../modals/deudas-modal";
import { renderChart } from "./dashboard-chart";
import { addKPI } from "./dashboard-kpi";
import type { TransaccionData } from "../types";

export interface PeriodContext {
  plugin: OrderManagerPlugin;
  transacciones: Array<{ file: import("obsidian").TFile; data: TransaccionData }>;
  deudas: Array<{ file: import("obsidian").TFile; data: import("../types").DeudaData }>;
  clientes: Array<{ file: import("obsidian").TFile; data: import("../types").ClienteData }>;
  proveedores: Array<{ file: import("obsidian").TFile; data: import("../types").ProveedorData }>;
  productos: Array<{ file: import("obsidian").TFile; data: import("../types").ProductoData }>;
  deudasAFavor: number;
  deudasEnContra: number;
  currency: string;
  kpiGrid: HTMLElement;
  resumenEl: HTMLElement;
  lastTransEl: HTMLElement;
  topProductsEl: HTMLElement;
  onRefresh: () => void;
}

export function renderPeriodData(
  ctx: PeriodContext,
  desde: string,
  hasta: string,
  periodLabel: string,
  displayCurrency: string
): void {
  const { plugin, transacciones, deudas, clientes, proveedores, productos } = ctx;
  const { kpiGrid, resumenEl, lastTransEl, topProductsEl } = ctx;
  const ref = plugin.settings.tasaReferencia || "USD";
  const rates = plugin.settings.tasasCambio || { USD: 1 };
  const showCurrency = displayCurrency || ref;

  const ingresosPeriodo = transacciones
    .filter((tr) => tr.data.clase === "ingreso" && tr.data.fecha >= desde && tr.data.fecha <= hasta)
    .reduce((sum, tr) => sum + (tr.data.monto_referencia || convertir(tr.data.monto || 0, tr.data.moneda || "USD", rates, ref)), 0);

  const egresosPeriodo = transacciones
    .filter((tr) => tr.data.clase === "egreso" && tr.data.fecha >= desde && tr.data.fecha <= hasta)
    .reduce((sum, tr) => sum + (tr.data.monto_referencia || convertir(tr.data.monto || 0, tr.data.moneda || "USD", rates, ref)), 0);

  const displayIngresos = convertir(ingresosPeriodo, ref, rates, showCurrency);
  const displayEgresos = convertir(egresosPeriodo, ref, rates, showCurrency);
  const displayBalance = displayIngresos - displayEgresos;
  const displayDeudasFavor = convertir(ctx.deudasAFavor, ref, rates, showCurrency);
  const displayDeudasContra = convertir(ctx.deudasEnContra, ref, rates, showCurrency);
  kpiGrid.empty();

  const transPeriodo = transacciones.filter(
    (tr) => tr.data.fecha >= desde && tr.data.fecha <= hasta
  );

  addKPI(kpiGrid, `${i18n("balanceMonth")} — ${periodLabel}`, displayBalance, showCurrency, "neutral", () => {
    new TransaccionesModal(plugin.app, `Balance — ${periodLabel}`, transPeriodo, ref, rates).open();
  });
  addKPI(kpiGrid, `${i18n("incomeMonth")} — ${periodLabel}`, displayIngresos, showCurrency, "positive", () => {
    const ingresos = transPeriodo.filter((tr) => tr.data.clase === "ingreso");
    new TransaccionesModal(plugin.app, `${i18n("income")} — ${periodLabel}`, ingresos, ref, rates).open();
  });
  addKPI(kpiGrid, `${i18n("expenseMonth")} — ${periodLabel}`, displayEgresos, showCurrency, "negative", () => {
    const egresos = transPeriodo.filter((tr) => tr.data.clase === "egreso");
    new TransaccionesModal(plugin.app, `${i18n("expense")} — ${periodLabel}`, egresos, ref, rates).open();
  });
  addKPI(kpiGrid, i18n("debtsFavor"), displayDeudasFavor, showCurrency, "positive", () => {
    const favor = deudas.filter((d) => d.data.clase === "a_favor" && d.data.estado !== "pagada");
    new DeudasModal(plugin.app, i18n("debtsFavor"), favor, ref).open();
  });
  addKPI(kpiGrid, i18n("debtsAgainst"), displayDeudasContra, showCurrency, "negative", () => {
    const contra = deudas.filter((d) => d.data.clase === "en_contra" && d.data.estado !== "pagada");
    new DeudasModal(plugin.app, i18n("debtsAgainst"), contra, ref).open();
  });

  resumenEl.empty();
  resumenEl.createEl("div", { cls: "ordermanager-section-title", text: i18n("summary") });
  const summary = resumenEl.createDiv();
  summary.createEl("p", {
    text: `${i18n("clients")}: ${clientes.length} | ${i18n("suppliers")}: ${proveedores.length} | ${i18n("inventory")}: ${productos.length}`,
  });
  const transEnPeriodo = transacciones.filter(
    (tr) => tr.data.fecha >= desde && tr.data.fecha <= hasta
  ).length;
  summary.createEl("p", {
    text: `${i18n("periodLabel")}: ${transEnPeriodo} | ${i18n("activeDebts")}: ${deudas.filter((d) => d.data.estado !== "pagada").length}`,
  });

  const lowStock = productos.filter((p) => {
    const min = p.data.stock_minimo ?? 0;
    return min > 0 && (p.data.stock ?? 0) <= min;
  });
  if (lowStock.length > 0) {
    const alertDiv = resumenEl.createDiv();
    alertDiv.setCssProps({
      marginTop: "8px",
      padding: "8px 12px",
      background: "rgba(var(--color-red-rgb),0.1)",
      border: "1px solid var(--color-red)",
      borderRadius: "4px",
    });
    alertDiv.createEl("strong", { text: `⚠ Stock bajo (${lowStock.length}): ` });
    alertDiv.createSpan({
      text: lowStock.map((p) => `${p.data.nombre} (${p.data.stock})`).join(", "),
    });
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const en7dias = new Date(hoy);
  en7dias.setDate(en7dias.getDate() + 7);
  const upcoming = deudas.filter((d) => {
    if (d.data.estado === "pagada" || !d.data.fecha_vencimiento) return false;
    const v = new Date(d.data.fecha_vencimiento + "T00:00:00");
    return v >= hoy && v <= en7dias;
  }).sort((a, b) => a.data.fecha_vencimiento.localeCompare(b.data.fecha_vencimiento));

  if (upcoming.length > 0) {
    const dueDiv = resumenEl.createDiv();
    dueDiv.setCssProps({
      marginTop: "8px",
      padding: "8px 12px",
      background: "rgba(var(--color-yellow-rgb),0.1)",
      border: "1px solid var(--color-yellow)",
      borderRadius: "4px",
    });
    dueDiv.createEl("strong", { text: `📅 Próximos vencimientos (${upcoming.length}):` });
    const dueList = dueDiv.createEl("div");
    dueList.setCssProps({marginTop: "4px", fontSize: "0.85em"});
    for (const d of upcoming) {
      const row = dueList.createDiv();
      row.createSpan({ text: `${d.data.fecha_vencimiento} — ` });
      row.createSpan({ text: `${d.data.clase === "a_favor" ? "Cobrar" : "Pagar"}: ${d.data.descripcion || "Deuda"} ` });
      row.createSpan({ text: formatCurrency((d.data.monto_total || 0) - (d.data.monto_pagado || 0), d.data.moneda) });
    }
  }

  lastTransEl.empty();
  const lastTransactions = transacciones
    .filter((tr) => tr.data.fecha >= desde && tr.data.fecha <= hasta)
    .sort((a, b) => b.data.fecha.localeCompare(a.data.fecha) || b.data.created.localeCompare(a.data.created))
    .slice(0, 5);

  if (lastTransactions.length > 0) {
    lastTransEl.createEl("div", {
      cls: "ordermanager-section-title",
      text: i18n("lastTransactions"),
    });

    const table = lastTransEl.createEl("table", { cls: "ordermanager-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    for (const h of ["Fecha", "Tipo", "Monto", "Categoría", "Descripción", i18n("receipt")]) {
      headerRow.createEl("th", { text: h });
    }

    const tbody = table.createEl("tbody");
    for (const tr of lastTransactions) {
      const d = tr.data;
      const row = tbody.createEl("tr", { cls: "clickable-row" });
      row.createEl("td", { text: d.fecha });
      row.createEl("td", {
        text: d.clase === "ingreso" ? i18n("income") : i18n("expense"),
        cls: `ordermanager-badge ${d.clase}`,
      });
      row.createEl("td", {
        text: formatCurrency(d.monto || 0, d.moneda || ctx.currency),
      });
      row.createEl("td", { text: d.categoria || "—" });
      row.createEl("td", { text: d.descripcion || "—" });
      const compTd = row.createEl("td");
      if (d.comprobante) {
        const icon = compTd.createEl("span", { text: "📎" });
        icon.setCssProps({cursor: "pointer"});
        icon.setAttr("title", d.comprobante + " — Click para abrir");
        icon.onclick = (e: MouseEvent) => {
          e.stopPropagation();
          void plugin.app.workspace.openLinkText(d.comprobante, "", false);
        };
      } else {
        compTd.createEl("span", { text: "—" });
      }

      row.onclick = () => {
        new TransaccionModal(
          plugin.app,
          plugin,
          ctx.onRefresh,
          d,
          tr.file
        ).open();
      };
    }
  }

  topProductsEl.empty();
  renderChart(resumenEl, transacciones, rates, ref, desde, hasta, periodLabel, convertir);
  topProductsEl.empty();
  const productSales = new Map<string, { count: number; total: number }>();
  for (const tr of transacciones) {
    if (tr.data.clase === "ingreso" && tr.data.fecha >= desde && tr.data.fecha <= hasta) {
      const prods = tr.data.productos && tr.data.productos.length > 0
        ? tr.data.productos
        : tr.data.producto
          ? [{ nombre: tr.data.producto, cantidad: 1, precio_unitario: tr.data.monto || 0 }]
          : [];
      for (const p of prods) {
        const existing = productSales.get(p.nombre) || { count: 0, total: 0 };
        existing.count += p.cantidad || 1;
        existing.total += (p.cantidad || 1) * (p.precio_unitario || 0);
        productSales.set(p.nombre, existing);
      }
    }
  }

  if (productSales.size > 0) {
    const topProducts = [...productSales.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
    const topSection = topProductsEl.createDiv();
    topSection.setCssProps({marginBottom: "16px"});
    const topBtn = topSection.createEl("button", { text: i18n("topProducts") });
    topBtn.addClass("ordermanager-btn-accent");
    topBtn.setCssProps({padding: "8px 16px", fontWeight: "600", fontSize: "0.9em", width: "100%"});
    const topContent = topSection.createDiv();
    topContent.setCssProps({display: "none", marginTop: "8px"});
    const topTable = topContent.createEl("table", { cls: "ordermanager-table" });
    const tHead = topTable.createEl("thead");
    const hRow = tHead.createEl("tr");
    for (const h of [i18n("rank"), i18n("product"), i18n("sales"), i18n("total")]) hRow.createEl("th", { text: h });
    const tBody = topTable.createEl("tbody");
    let rank = 1;
    for (const [nombre, data] of topProducts) {
      const row = tBody.createEl("tr");
      row.createEl("td", { text: String(rank++) });
      row.createEl("td", { text: nombre });
      row.createEl("td", { text: String(data.count) });
      row.createEl("td", { text: formatCurrency(data.total, showCurrency) });
    }
    topBtn.onclick = () => {
      topContent.setCssProps({display: topContent.style.display === "none" ? "block" : "none"});
      topBtn.textContent = topContent.style.display === "none" ? i18n("topProducts") : i18n("hideTop");
    };
  }
}
