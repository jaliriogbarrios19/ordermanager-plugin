import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type OrderManagerPlugin from "../main";
import { formatCurrency } from "../utils/currency";
import { monthStart, monthEnd, weekStart, weekEnd, today, yearStart, yearEnd, quarterStart, quarterEnd, lastYearStart, lastYearEnd } from "../utils/date";
import { t as i18n } from "../i18n";
import { convertir, fetchExchangeRates, rebaseRates, getRatesForDate } from "../utils/exchange";
import { MONEDA_SOURCES } from "../types";
import { VIEW_TYPE_TRANSACCIONES } from "./transacciones-view";
import { VIEW_TYPE_CLIENTES } from "./clientes-view";
import { VIEW_TYPE_PROVEEDORES } from "./proveedores-view";
import { VIEW_TYPE_INVENTARIO } from "./inventario-view";
import { VIEW_TYPE_DEUDAS } from "./deudas-view";
import { TransaccionModal } from "../modals/transaccion-modal";
import { ClienteModal } from "../modals/cliente-modal";
import { ProductoModal } from "../modals/producto-modal";
import { renderPeriodData, type PeriodContext } from "./dashboard-period";
import type { TransaccionData } from "../types";

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
          void this.refresh();
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
      new Setting(container).setName(i18n("noBookSelected")).setHeading();
      const msg = container.createEl("p", {
        text: i18n("noBookSelectedDesc"),
        cls: "ordermanager-text-muted",
      });
      msg.setCssProps({margin: "16px 0"});
      return;
    }

    let periodStart = monthStart();
    let periodEnd = monthEnd();
    let periodLabel = "Este mes";

    const transacciones = await dm.getTransacciones();
    await dm.processRecurring();
    const deudas = await dm.getDeudas();

    const ref = this.plugin.settings.tasaReferencia || "USD";
    const rates = this.plugin.settings.tasasCambio || { USD: 1 };
    const histRates = this.plugin.settings.tasasHistoricas || {};

    const deudasAFavor = deudas
      .filter((d) => d.data.clase === "a_favor" && d.data.estado !== "pagada")
      .reduce((sum, d) => {
        const restante = (d.data.monto_total || 0) - (d.data.monto_pagado || 0);
        if (d.data.monto_referencia) {
          const pagadoRef = d.data.monto_pagado
            ? convertir(d.data.monto_pagado, d.data.moneda || "USD", getRatesForDate(d.data.fecha_inicio || "", histRates, rates), ref)
            : 0;
          return sum + ((d.data.monto_referencia || 0) - pagadoRef);
        }
        const debtRates = getRatesForDate(d.data.fecha_inicio || "", histRates, rates);
        return sum + convertir(restante, d.data.moneda || "USD", debtRates, ref);
      }, 0);

    const deudasEnContra = deudas
      .filter((d) => d.data.clase === "en_contra" && d.data.estado !== "pagada")
      .reduce((sum, d) => {
        const restante = (d.data.monto_total || 0) - (d.data.monto_pagado || 0);
        if (d.data.monto_referencia) {
          const pagadoRef = d.data.monto_pagado
            ? convertir(d.data.monto_pagado, d.data.moneda || "USD", getRatesForDate(d.data.fecha_inicio || "", histRates, rates), ref)
            : 0;
          return sum + ((d.data.monto_referencia || 0) - pagadoRef);
        }
        const debtRates = getRatesForDate(d.data.fecha_inicio || "", histRates, rates);
        return sum + convertir(restante, d.data.moneda || "USD", debtRates, ref);
      }, 0);

    const [clientes, proveedores, productos] = await Promise.all([
      dm.getClientes(),
      dm.getProveedores(),
      dm.getProductos(),
    ]);

    const libroActivo = this.plugin.settings.libroActivo;

    new Setting(container).setName(`${i18n("dashboard")} — ${libroActivo}`).setHeading();

    if (this.plugin.settings.libros.length > 1) {
      const switchRow = container.createDiv({ cls: "ordermanager-toolbar" });
      const bookLbl = switchRow.createEl("span", { text: `${i18n("book")}:` });
      bookLbl.addClass("ordermanager-text-muted");
      bookLbl.setCssProps({fontSize: "0.85em"});
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
        void this.refresh();
      };
    }

    const curRow = container.createDiv({ cls: "ordermanager-toolbar" });
    const curLbl = curRow.createEl("span", { text: "Moneda:" });
    curLbl.addClass("ordermanager-text-muted");
    curLbl.setCssProps({fontSize: "0.85em"});
    let displayCurrency = this.plugin.settings.tasaReferencia || "USD";
    const curSelector = curRow.createEl("select");
    const availableCurrencies = Object.keys(this.plugin.settings.tasasCambio || {}).filter((k) => !k.startsWith("_"));
    for (const c of availableCurrencies) {
      const source = MONEDA_SOURCES.find((s) => s.code === c);
      const opt = curSelector.createEl("option", { text: source?.label || c, value: c });
      if (c === displayCurrency) opt.selected = true;
    }

    const updateRatesBtn = curRow.createEl("button", { text: "Actualizar tasas" });
    updateRatesBtn.setCssProps({
      marginLeft: "8px",
      padding: "4px 12px",
      border: "1px solid var(--background-modifier-border)",
      borderRadius: "4px",
      background: "var(--background-secondary)",
      color: "var(--text-muted)",
      cursor: "pointer",
      fontSize: "0.8em",
      whiteSpace: "nowrap",
    });

    const periodRow = container.createDiv({ cls: "ordermanager-toolbar" });
    const periodLbl = periodRow.createEl("span", { text: `${i18n("period")}:` });
    periodLbl.addClass("ordermanager-text-muted");
    periodLbl.setCssProps({fontSize: "0.85em"});
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
    customRow.setCssProps({display: "none", marginLeft: "8px"});
    const dateFromInput = customRow.createEl("input", { type: "date" });
    dateFromInput.setCssProps({
      padding: "4px 8px",
      border: "1px solid var(--background-modifier-border)",
      borderRadius: "4px",
      fontSize: "0.85em",
    });
    const dateToInput = customRow.createEl("input", { type: "date" });
    dateToInput.setCssProps({
      padding: "4px 8px",
      border: "1px solid var(--background-modifier-border)",
      borderRadius: "4px",
      fontSize: "0.85em",
    });
    const applyBtn = customRow.createEl("button", { text: i18n("apply") });
    applyBtn.addClass("ordermanager-btn-accent");
    applyBtn.setCssProps({padding: "4px 12px", fontSize: "0.85em", marginLeft: "4px"});

    const kpiGrid = container.createDiv({ cls: "ordermanager-kpi-grid" });
    const resumenEl = container.createDiv();
    const lastTransEl = container.createDiv();
    const topProductsEl = container.createDiv();

    const periodCtx: PeriodContext = {
      plugin: this.plugin,
      transacciones,
      deudas,
      clientes,
      proveedores,
      productos,
      deudasAFavor,
      deudasEnContra,
      currency,
      kpiGrid,
      resumenEl,
      lastTransEl,
      topProductsEl,
      onRefresh: () => { void this.refresh(); },
    };

    const doRender = () => {
      renderPeriodData(periodCtx, periodStart, periodEnd, periodLabel, displayCurrency);
    };

    curSelector.onchange = () => {
      displayCurrency = curSelector.value;
      doRender();
    };

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
          doRender();
          new Notice(`${updated} tasa(s) actualizada(s)`);
        }
      } catch { /* offline */ }
      updateRatesBtn.textContent = "Actualizar tasas";
      updateRatesBtn.disabled = false;
    };

    periodSelector.onchange = () => {
      const val = periodSelector.value;
      if (val === "month") {
        periodStart = monthStart();
        periodEnd = monthEnd();
        periodLabel = "Este mes";
        customRow.setCssProps({display: "none"});
      } else if (val === "week") {
        periodStart = weekStart();
        periodEnd = weekEnd();
        periodLabel = "Esta semana";
        customRow.setCssProps({display: "none"});
      } else if (val === "day") {
        periodStart = today();
        periodEnd = today();
        periodLabel = "Hoy";
        customRow.setCssProps({display: "none"});
      } else if (val === "year") {
        periodStart = yearStart();
        periodEnd = yearEnd();
        periodLabel = "Este año";
        customRow.setCssProps({display: "none"});
      } else if (val === "quarter") {
        periodStart = quarterStart();
        periodEnd = quarterEnd();
        periodLabel = "Este trimestre";
        customRow.setCssProps({display: "none"});
      } else if (val === "lastyear") {
        periodStart = lastYearStart();
        periodEnd = lastYearEnd();
        periodLabel = "Año pasado";
        customRow.setCssProps({display: "none"});
      } else {
        customRow.setCssProps({display: "inline-block"});
        return;
      }
      doRender();
    };

    applyBtn.onclick = () => {
      if (dateFromInput.value && dateToInput.value) {
        periodStart = dateFromInput.value;
        periodEnd = dateToInput.value;
        periodLabel = `${dateFromInput.value} → ${dateToInput.value}`;
        doRender();
      }
    };

    container.createEl("div", { cls: "ordermanager-section-title", text: i18n("quickActions") });
    const quickBar = container.createDiv({ cls: "ordermanager-toolbar" });
    quickBar.createEl("button", { text: i18n("newTransactionBtn") }).onclick = () => {
      new TransaccionModal(this.plugin.app, this.plugin, () => { void this.refresh(); }, {
        tipo: "transaccion",
        clase: "ingreso",
        tipo_operacion: "venta",
        modalidad_pago: "contado",
        productos: [],
        moneda: currency,
      } as Partial<TransaccionData>).open();
    };
    quickBar.createEl("button", { text: i18n("newClientTitle") }).onclick = () => {
      new ClienteModal(this.plugin.app, this.plugin, () => { void this.refresh(); }).open();
    };
    quickBar.createEl("button", { text: i18n("newProductTitle") }).onclick = () => {
      new ProductoModal(this.plugin.app, this.plugin, () => { void this.refresh(); }).open();
    };

    doRender();

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
