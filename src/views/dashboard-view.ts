import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type OrderManagerPlugin from "../main";
import { formatCurrency } from "../utils/currency";
import { monthStart, monthEnd, weekStart, weekEnd, today, yearStart, yearEnd, quarterStart, quarterEnd, lastYearStart, lastYearEnd } from "../utils/date";
import { t as i18n } from "../i18n";
import { convertir, fetchExchangeRates, rebaseRates } from "../utils/exchange";
import { MONEDA_SOURCES } from "../types";
import { renderChart } from "./dashboard-chart";
import { addKPI } from "./dashboard-kpi";
import { VIEW_TYPE_TRANSACCIONES } from "./transacciones-view";
import { VIEW_TYPE_CLIENTES } from "./clientes-view";
import { VIEW_TYPE_PROVEEDORES } from "./proveedores-view";
import { VIEW_TYPE_INVENTARIO } from "./inventario-view";
import { VIEW_TYPE_DEUDAS } from "./deudas-view";
import { TransaccionModal } from "../modals/transaccion-modal";
import { ClienteModal } from "../modals/cliente-modal";
import { ProductoModal } from "../modals/producto-modal";

export const VIEW_TYPE_DASHBOARD = "ordermanager-dashboard";

export class DashboardView extends ItemView {
  plugin: OrderManagerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: OrderManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DASHBOARD;
  }

  getDisplayText(): string {
    return "OrderManager";
  }

  getIcon(): string {
    return "landmark";
  }

  private firstRender = true;

  async onOpen() {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view === this && !this.firstRender) {
          this.refresh();
        }
        this.firstRender = false;
      })
    );
    await this.refresh();
    this.firstRender = false;
  }

  async refresh() {
    const container = this.contentEl;
    container.empty();
    container.addClass("ordermanager-dashboard");

    const dm = this.plugin.dataManager;
    const currency = this.plugin.settings.defaultCurrency;

    if (!this.plugin.settings.libroActivo) {
      container.createEl("h2", { text: i18n("noBookSelected") });
      const msg = container.createEl("p", {
        text: i18n("noBookSelectedDesc"),
        cls: "ordermanager-text-muted",
      });
      msg.style.cssText = "margin:16px 0;color:var(--text-muted);";
      return;
    }

    let periodStart = monthStart();
    let periodEnd = monthEnd();
    let periodLabel = "Este mes";

    const transacciones = await dm.getTransacciones();
    await dm.processRecurring();
    const deudas = await dm.getDeudas();

    const deudasAFavor = deudas
      .filter((d) => d.data.clase === "a_favor" && d.data.estado !== "pagada")
      .reduce((sum, d) => sum + ((d.data.monto_total || 0) - (d.data.monto_pagado || 0)), 0);

    const deudasEnContra = deudas
      .filter((d) => d.data.clase === "en_contra" && d.data.estado !== "pagada")
      .reduce((sum, d) => sum + ((d.data.monto_total || 0) - (d.data.monto_pagado || 0)), 0);

    const [clientes, proveedores, productos] = await Promise.all([
      dm.getClientes(),
      dm.getProveedores(),
      dm.getProductos(),
    ]);

    const valorInventario = productos.reduce(
      (sum, p) => sum + (p.data.precio_costo || 0) * (p.data.stock || 0),
      0
    );

    const libroActivo = this.plugin.settings.libroActivo;

    container.createEl("h2", { text: `${i18n("dashboard")} — ${libroActivo}` });

    if (this.plugin.settings.libros.length > 1) {
      const switchRow = container.createDiv({ cls: "ordermanager-toolbar" });
      switchRow.createEl("span", { text: `${i18n("book")}:` }).style.cssText =
        "font-size:0.85em;color:var(--text-muted);";
      const selector = switchRow.createEl("select");
      for (const n of this.plugin.settings.libros) {
        const opt = selector.createEl("option", { text: n });
        if (n === libroActivo) opt.selected = true;
      }
      selector.onchange = async () => {
        this.plugin.settings.libroActivo = selector.value;
        await this.plugin.saveSettings();
        this.plugin.dataManager.updateSettings(this.plugin.settings);
        await this.plugin.dataManager.ensureBaseFolders();
        this.refresh();
      };
    }

    const curRow = container.createDiv({ cls: "ordermanager-toolbar" });
    curRow.createEl("span", { text: "Moneda:" }).style.cssText =
      "font-size:0.85em;color:var(--text-muted);";
    let displayCurrency = this.plugin.settings.tasaReferencia || "USD";
    const curSelector = curRow.createEl("select");
    const availableCurrencies = Object.keys(this.plugin.settings.tasasCambio || {}).filter((k) => !k.startsWith("_"));
    for (const c of availableCurrencies) {
      const source = MONEDA_SOURCES.find((s) => s.code === c);
      const opt = curSelector.createEl("option", { text: source?.label || c, value: c });
      if (c === displayCurrency) opt.selected = true;
    }
    curSelector.onchange = () => {
      displayCurrency = curSelector.value;
      renderPeriodData();
    };

    const updateRatesBtn = curRow.createEl("button", { text: "Actualizar tasas" });
    updateRatesBtn.style.cssText =
      "margin-left:8px;padding:4px 12px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-secondary);color:var(--text-muted);cursor:pointer;font-size:0.8em;white-space:nowrap;";
    updateRatesBtn.onclick = async () => {
      updateRatesBtn.textContent = "⏳";
      updateRatesBtn.disabled = true;
      try {
        const monedas = Object.keys(this.plugin.settings.tasasCambio).filter((k) => !k.startsWith("_"));
        const rates = await fetchExchangeRates(monedas);
        const bcvRaw = rates["_BCV_PRICE"];
        if (bcvRaw && bcvRaw > 0) {
          this.plugin.settings.bcvPrice = bcvRaw;
        }
        const rebased = rebaseRates(rates, this.plugin.settings.tasaReferencia || "USD");
        let updated = 0;
        for (const code of monedas) {
          if (rebased[code] !== undefined) {
            this.plugin.settings.tasasCambio[code] = rebased[code];
            updated++;
          }
        }
        if (updated > 0) {
          this.plugin.settings.fechaTasas = new Date().toISOString();
          await this.plugin.saveSettings();
          this.plugin.dataManager.updateSettings(this.plugin.settings);
          renderPeriodData();
          new Notice(`${updated} tasa(s) actualizada(s)`);
        }
      } catch { /* offline */ }
      updateRatesBtn.textContent = "Actualizar tasas";
      updateRatesBtn.disabled = false;
    };

    const periodRow = container.createDiv({ cls: "ordermanager-toolbar" });
    periodRow.createEl("span", { text: `${i18n("period")}:` }).style.cssText =
      "font-size:0.85em;color:var(--text-muted);";
    const periodSelector = periodRow.createEl("select");
    periodSelector.createEl("option", { text: i18n("thisMonth"), value: "month" });
    periodSelector.createEl("option", { text: i18n("thisWeek"), value: "week" });
    periodSelector.createEl("option", { text: i18n("today"), value: "day" });
    periodSelector.createEl("option", { text: "Este año", value: "year" });
    periodSelector.createEl("option", { text: "Este trimestre", value: "quarter" });
    periodSelector.createEl("option", { text: "Año pasado", value: "lastyear" });
    periodSelector.createEl("option", { text: i18n("custom"), value: "custom" });
    periodSelector.value = "month";

    const customRow = periodRow.createDiv();
    customRow.style.cssText = "display:none;margin-left:8px;";
    const dateFromInput = customRow.createEl("input", { type: "date" });
    dateFromInput.style.cssText =
      "padding:4px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;font-size:0.85em;";
    const dateToInput = customRow.createEl("input", { type: "date" });
    dateToInput.style.cssText = dateFromInput.style.cssText;
    const applyBtn = customRow.createEl("button", { text: i18n("apply") });
    applyBtn.style.cssText =
      "padding:4px 12px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:0.85em;margin-left:4px;";

    const kpiGrid = container.createDiv({ cls: "ordermanager-kpi-grid" });
    const resumenEl = container.createDiv();
    const lastTransEl = container.createDiv();
    const topProductsEl = container.createDiv();

    const renderChartFn = (rRates: Record<string, number>, rRef: string, desde: string, hasta: string) => {
      renderChart(resumenEl, transacciones, rRates, rRef, desde, hasta, periodLabel, convertir);
    };

    const renderPeriodData = () => {
      const desde = periodStart;
      const hasta = periodEnd;
      const ref = this.plugin.settings.tasaReferencia || "USD";
      const rates = this.plugin.settings.tasasCambio || { USD: 1 };
      const showCurrency = displayCurrency || ref;

      const ingresosPeriodo = transacciones
        .filter((t) => t.data.clase === "ingreso" && t.data.fecha >= desde && t.data.fecha <= hasta)
        .reduce((sum, t) => sum + (t.data.monto_referencia || convertir(t.data.monto || 0, t.data.moneda || "USD", rates, ref)), 0);

      const egresosPeriodo = transacciones
        .filter((t) => t.data.clase === "egreso" && t.data.fecha >= desde && t.data.fecha <= hasta)
        .reduce((sum, t) => sum + (t.data.monto_referencia || convertir(t.data.monto || 0, t.data.moneda || "USD", rates, ref)), 0);

      const balance = ingresosPeriodo - egresosPeriodo;

      const displayIngresos = convertir(ingresosPeriodo, ref, rates, showCurrency);
      const displayEgresos = convertir(egresosPeriodo, ref, rates, showCurrency);
      const displayBalance = displayIngresos - displayEgresos;
      const displayDeudasFavor = convertir(deudasAFavor, ref, rates, showCurrency);
      const displayDeudasContra = convertir(deudasEnContra, ref, rates, showCurrency);
      const displayInventario = convertir(valorInventario, ref, rates, showCurrency);

      kpiGrid.empty();
      addKPI(kpiGrid, `${i18n("balanceMonth")} — ${periodLabel}`, displayBalance, showCurrency);
      addKPI(kpiGrid, `${i18n("incomeMonth")} — ${periodLabel}`, displayIngresos, showCurrency, "positive");
      addKPI(kpiGrid, `${i18n("expenseMonth")} — ${periodLabel}`, displayEgresos, showCurrency, "negative");
      addKPI(kpiGrid, i18n("debtsFavor"), displayDeudasFavor, showCurrency, "positive");
      addKPI(kpiGrid, i18n("debtsAgainst"), displayDeudasContra, showCurrency, "negative");

      resumenEl.empty();
      resumenEl.createEl("div", { cls: "ordermanager-section-title", text: i18n("summary") });
      const summary = resumenEl.createDiv();
      summary.createEl("p", {
        text: `${i18n("clients")}: ${clientes.length} | ${i18n("suppliers")}: ${proveedores.length} | ${i18n("inventory")}: ${productos.length}`,
      });
      const transEnPeriodo = transacciones.filter(
        (t) => t.data.fecha >= desde && t.data.fecha <= hasta
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
        alertDiv.style.cssText =
          "margin-top:8px;padding:8px 12px;background:rgba(var(--color-red-rgb),0.1);border:1px solid var(--color-red);border-radius:4px;";
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
        dueDiv.style.cssText =
          "margin-top:8px;padding:8px 12px;background:rgba(var(--color-yellow-rgb),0.1);border:1px solid var(--color-yellow);border-radius:4px;";
        dueDiv.createEl("strong", { text: `📅 Próximos vencimientos (${upcoming.length}):` });
        const dueList = dueDiv.createEl("div");
        dueList.style.cssText = "margin-top:4px;font-size:0.85em;";
        for (const d of upcoming) {
          const row = dueList.createDiv();
          row.createSpan({ text: `${d.data.fecha_vencimiento} — ` });
          row.createSpan({ text: `${d.data.clase === "a_favor" ? "Cobrar" : "Pagar"}: ${d.data.descripcion || "Deuda"} ` });
          row.createSpan({ text: formatCurrency((d.data.monto_total || 0) - (d.data.monto_pagado || 0), d.data.moneda) });
        }
      }

      lastTransEl.empty();
      const lastTransactions = transacciones
        .filter((t) => t.data.fecha >= desde && t.data.fecha <= hasta)
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
        for (const t of lastTransactions) {
          const d = t.data;
          const row = tbody.createEl("tr", { cls: "clickable-row" });
          row.createEl("td", { text: d.fecha });
          row.createEl("td", {
            text: d.clase === "ingreso" ? i18n("income") : i18n("expense"),
            cls: `ordermanager-badge ${d.clase}`,
          });
          row.createEl("td", {
            text: formatCurrency(d.monto || 0, d.moneda || currency),
          });
          row.createEl("td", { text: d.categoria || "—" });
          row.createEl("td", { text: d.descripcion || "—" });
          const compTd = row.createEl("td");
          if (d.comprobante) {
            const icon = compTd.createEl("span", { text: "📎" });
            icon.style.cursor = "pointer";
            icon.setAttr("title", d.comprobante + " — Click para abrir");
            icon.onclick = (e: MouseEvent) => {
              e.stopPropagation();
              this.app.workspace.openLinkText(d.comprobante, "", false);
            };
          } else {
            compTd.createEl("span", { text: "—" });
          }

          row.onclick = () => {
            new TransaccionModal(
              this.plugin.app,
              this.plugin,
              () => this.refresh(),
              d,
              t.file
            ).open();
          };
        }
      }

      topProductsEl.empty();
      renderChartFn(rates, ref, desde, hasta);
      topProductsEl.empty();
      const productSales = new Map<string, { count: number; total: number }>();
      for (const t of transacciones) {
        if (t.data.clase === "ingreso" && t.data.fecha >= desde && t.data.fecha <= hasta) {
          const prods = t.data.productos && t.data.productos.length > 0
            ? t.data.productos
            : t.data.producto
              ? [{ nombre: t.data.producto, cantidad: 1, precio_unitario: t.data.monto || 0 }]
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
        topSection.style.cssText = "margin-bottom:16px;";
        const topBtn = topSection.createEl("button", { text: i18n("topProducts") });
        topBtn.style.cssText =
          "padding:8px 16px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-weight:600;font-size:0.9em;width:100%;";
        const topContent = topSection.createDiv();
        topContent.style.cssText = "display:none;margin-top:8px;";
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
          topContent.style.display = topContent.style.display === "none" ? "block" : "none";
          topBtn.textContent = topContent.style.display === "none" ? i18n("topProducts") : i18n("hideTop");
        };
      }
    };

    periodSelector.onchange = () => {
      const val = periodSelector.value;
      if (val === "month") {
        periodStart = monthStart();
        periodEnd = monthEnd();
        periodLabel = "Este mes";
        customRow.style.display = "none";
      } else if (val === "week") {
        periodStart = weekStart();
        periodEnd = weekEnd();
        periodLabel = "Esta semana";
        customRow.style.display = "none";
      } else if (val === "day") {
        periodStart = today();
        periodEnd = today();
        periodLabel = "Hoy";
        customRow.style.display = "none";
      } else if (val === "year") {
        periodStart = yearStart();
        periodEnd = yearEnd();
        periodLabel = "Este año";
        customRow.style.display = "none";
      } else if (val === "quarter") {
        periodStart = quarterStart();
        periodEnd = quarterEnd();
        periodLabel = "Este trimestre";
        customRow.style.display = "none";
      } else if (val === "lastyear") {
        periodStart = lastYearStart();
        periodEnd = lastYearEnd();
        periodLabel = "Año pasado";
        customRow.style.display = "none";
      } else {
        customRow.style.display = "inline-block";
        return;
      }
      renderPeriodData();
    };

    applyBtn.onclick = () => {
      if (dateFromInput.value && dateToInput.value) {
        periodStart = dateFromInput.value;
        periodEnd = dateToInput.value;
        periodLabel = `${dateFromInput.value} → ${dateToInput.value}`;
        renderPeriodData();
      }
    };

    container.createEl("div", { cls: "ordermanager-section-title", text: i18n("quickActions") });
    const quickBar = container.createDiv({ cls: "ordermanager-toolbar" });
    quickBar.createEl("button", { text: i18n("newTransactionBtn") }).onclick = () => {
      new TransaccionModal(this.plugin.app, this.plugin, () => this.refresh(), {
        clase: "ingreso",
        tipo_operacion: "venta",
        modalidad_pago: "contado",
        productos: [],
        moneda: currency,
      } as any).open();
    };
    quickBar.createEl("button", { text: i18n("newClientTitle") }).onclick = () => {
      new ClienteModal(this.plugin.app, this.plugin, () => this.refresh()).open();
    };
    quickBar.createEl("button", { text: i18n("newProductTitle") }).onclick = () => {
      new ProductoModal(this.plugin.app, this.plugin, () => this.refresh()).open();
    };

    renderPeriodData();

    const navBar = container.createDiv({ cls: "ordermanager-toolbar" });
    navBar.createEl("button", { text: i18n("transactions") }).onclick = () =>
      this.plugin.activateView(VIEW_TYPE_TRANSACCIONES);
    navBar.createEl("button", { text: i18n("clients") }).onclick = () =>
      this.plugin.activateView(VIEW_TYPE_CLIENTES);
    navBar.createEl("button", { text: i18n("suppliers") }).onclick = () =>
      this.plugin.activateView(VIEW_TYPE_PROVEEDORES);
    navBar.createEl("button", { text: i18n("inventory") }).onclick = () =>
      this.plugin.activateView(VIEW_TYPE_INVENTARIO);
    navBar.createEl("button", { text: i18n("debts") }).onclick = () =>
      this.plugin.activateView(VIEW_TYPE_DEUDAS);
  }

  async onClose() {
    this.contentEl.empty();
  }
}
