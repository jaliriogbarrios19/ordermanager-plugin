import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type OrderManagerPlugin from "../main";
import { DeudaModal } from "../modals/deuda-modal";
import { formatCurrency } from "../utils/currency";
import { formatDate } from "../utils/date";
import { VIEW_TYPE_DASHBOARD, DashboardView } from "./dashboard-view";
import { exportDeudasCSV, downloadCSV } from "../utils/export";
import { t as i18n } from "../i18n";
import { convertir, getRatesForDate } from "../utils/exchange";
import { confirmAction } from "../utils/confirm";
import { PagoDeudaModal } from "../modals/pago-deuda-modal";
import { renderDebtSummaryCards } from "./debt-summary";

export const VIEW_TYPE_DEUDAS = "ordermanager-deudas";

export class DeudasView extends ItemView {
  plugin: OrderManagerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: OrderManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DEUDAS;
  }

  getDisplayText(): string {
    return "Deudas";
  }

  getIcon(): string {
    return "banknote";
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

    new Setting(container).setName(i18n("debts")).setHeading();
    const backBtn = container.createEl("button", { text: i18n("backToDashboard"),
      cls: "ordermanager-toolbar",
    });
    backBtn.addClass("ordermanager-back-btn");
    backBtn.onclick = () => this.plugin.activateView(VIEW_TYPE_DASHBOARD);

    const toolbar = container.createDiv({ cls: "ordermanager-toolbar" });

    const searchInput = toolbar.createEl("input", {
      type: "text",
      placeholder: "Buscar deuda...",
    });

    const filterClase = toolbar.createEl("select");
    filterClase.createEl("option", { text: i18n("all"), value: "" });
    filterClase.createEl("option", { text: i18n("favorMe"), value: "a_favor" });
    filterClase.createEl("option", { text: i18n("againstMe"), value: "en_contra" });

    const filterEstado = toolbar.createEl("select");
    filterEstado.createEl("option", { text: i18n("activeDebts"), value: "activas" });
    filterEstado.createEl("option", { text: i18n("allStates"), value: "" });
    filterEstado.createEl("option", { text: i18n("pending"), value: "pendiente" });
    filterEstado.createEl("option", { text: i18n("paid"), value: "pagada" });
    filterEstado.createEl("option", { text: i18n("overdue"), value: "vencida" });
    filterEstado.value = "activas";

    const refreshAll = async () => {
      const dashView = this.plugin.getExistingView(VIEW_TYPE_DASHBOARD);
      if (dashView instanceof DashboardView) {
        await dashView.refresh();
      }
      await this.refresh();
    };

    toolbar.createEl("button", { text: "CSV", cls: "secondary" }).onclick = () => {
      const csv = exportDeudasCSV(sorted);
      downloadCSV(csv, `deudas-${new Date().toISOString().split("T")[0]}.csv`);
    };

    const deudas = await this.plugin.dataManager.getDeudas();
    const sorted = [...deudas].sort(
      (a, b) =>
        (b.data.fecha_vencimiento || "").localeCompare(a.data.fecha_vencimiento || "") ||
        (b.data.fecha_inicio || "").localeCompare(a.data.fecha_inicio || "")
    );

    const ref = this.plugin.settings.tasaReferencia || "USD";
    const rates = this.plugin.settings.tasasCambio || { USD: 1 };
    const histRates = this.plugin.settings.tasasHistoricas || {};
    renderDebtSummaryCards(container, deudas, this.plugin.settings.defaultCurrency, ref, rates, histRates);

    const tableWrapper = container.createDiv();
    const render = () => {
      tableWrapper.empty();
      const search = searchInput.value.toLowerCase();
      const clase = filterClase.value;
      const estado = filterEstado.value;

      const filtered = sorted.filter((d) => {
        if (search) {
          const desc = (d.data.descripcion || "").toLowerCase();
          const cli = (d.data.cliente || "").toLowerCase();
          const prov = (d.data.proveedor || "").toLowerCase();
          if (!desc.includes(search) && !cli.includes(search) && !prov.includes(search))
            return false;
        }
        if (clase && d.data.clase !== clase) return false;
        if (estado === "activas") {
          if (d.data.estado === "pagada") return false;
        } else if (estado && d.data.estado !== estado) return false;
        return true;
      });

      if (filtered.length === 0) {
        const empty = tableWrapper.createDiv({ cls: "ordermanager-empty" });
        empty.createEl("div", { text: i18n("noDebts"), cls: "ordermanager-empty-title" });
        empty.createEl("p", { text: i18n("noDebtsDesc") });
        return;
      }

      const table = tableWrapper.createEl("table", { cls: "ordermanager-table" });
      const thead = table.createEl("thead");
      const hr = thead.createEl("tr");
      for (const h of [
        "Descripción",
        "Tipo",
        "Total",
        "Pagado",
        "Restante",
        "Vencimiento",
        "Contacto",
        "Estado",
        "",
      ]) {
        hr.createEl("th", { text: h });
      }

      const tbody = table.createEl("tbody");
      for (const d of filtered) {
        const data = d.data;
        const esProducto = data.deuda_tipo === "producto";
        const restante = (data.monto_total || 0) - (data.monto_pagado || 0);

        const row = tbody.createEl("tr", { cls: "clickable-row" });

        if (esProducto) {
          row.createEl("td", {
            text: `${data.producto || "—"} × ${data.cantidad_producto || 0}`,
          });
        } else {
          row.createEl("td", { text: data.descripcion || "—" });
        }
        row.createEl("td", {
          text: esProducto
            ? data.clase === "a_favor"
              ? "Producto (A favor)"
              : "Producto (En contra)"
            : data.clase === "a_favor"
            ? "A favor"
            : "En contra",
        });
        row.createEl("td", {
          text: esProducto ? "—" : formatCurrency(data.monto_total || 0, data.moneda),
        });
        row.createEl("td", {
          text: esProducto ? "—" : formatCurrency(data.monto_pagado || 0, data.moneda),
        });
        row.createEl("td", {
          text: esProducto ? "—" : formatCurrency(restante, data.moneda),
        });
        row.createEl("td", {
          text: data.fecha_vencimiento
            ? formatDate(data.fecha_vencimiento)
            : "—",
        });
        row.createEl("td", {
          text: data.cliente || data.proveedor || "—",
        });
        row.createEl("td", {
          text: data.estado.charAt(0).toUpperCase() + data.estado.slice(1),
          cls: `ordermanager-badge ${data.estado}`,
        });

        const actionTd = row.createEl("td");
        actionTd.addClass("ordermanager-flex-row");
        actionTd.setCssProps({gap: "4px"});

        if (data.estado !== "pagada" && !esProducto) {
          const payBtn = actionTd.createEl("button", { text: "$" });
          payBtn.title = "Registrar pago";
          payBtn.setCssProps({
            padding: "2px 6px",
            border: "none",
            borderRadius: "4px",
            background: "var(--color-green)",
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.85em",
            lineHeight: "1",
          });
          payBtn.onclick = (e: MouseEvent) => {
            e.stopPropagation();
            const restante = (data.monto_total || 0) - (data.monto_pagado || 0);
            new PagoDeudaModal(
              this.plugin.app,
              restante,
              data.moneda,
              (parsed) => { void (async () => {
                if (parsed === null || parsed <= 0) return;
                try {
                  const newPagado = (data.monto_pagado || 0) + parsed;
                  const updated = newPagado >= (data.monto_total || 0) ? "pagada" : data.estado;
                  await this.plugin.dataManager.saveDeuda(
                    { ...data, monto_pagado: newPagado, estado: updated },
                    d.file
                  );
                  const ref = this.plugin.settings.tasaReferencia || "USD";
                  const currentRates = this.plugin.settings.tasasCambio || { USD: 1 };
                  const histRates = this.plugin.settings.tasasHistoricas || {};
                  const rates = getRatesForDate(data.fecha_inicio, histRates, currentRates);
                  const esAFavor = data.clase === "a_favor";
                  await this.plugin.dataManager.saveTransaccion({
                    clase: esAFavor ? "ingreso" : "egreso",
                    monto: parsed,
                    monto_referencia: convertir(parsed, data.moneda, rates, ref),
                    moneda: data.moneda,
                    fecha: new Date().toISOString().split("T")[0],
                    categoria: esAFavor ? "Cobro de deuda" : "Pago de deuda",
                    cliente: data.cliente,
                    proveedor: data.proveedor,
                    descripcion: `Abono: ${data.descripcion || "Deuda"}`,
                    estado: "confirmado",
                    deuda_ref: d.file.path,
                  });
                  const dashView = this.plugin.getExistingView(VIEW_TYPE_DASHBOARD);
                  if (dashView instanceof DashboardView) {
                    await dashView.refresh();
                  }
                  void this.refresh();
                  new Notice(`Pago registrado: ${formatCurrency(parsed, data.moneda)}`);
                } catch (err) {
                  new Notice("Error al registrar el pago. Revisá la consola (Ctrl+Shift+I).");
                  console.error("OrderManager: error al registrar pago de deuda", err);
                }
              })(); }
            ).open();
          };
        }

        const delBtn = actionTd.createEl("button", { text: "×" });
        delBtn.addClass("ordermanager-btn-del");
        delBtn.onclick = async (e: MouseEvent) => {
          e.stopPropagation();
          if (!await confirmAction(this.plugin.app, "¿Eliminar esta deuda?")) return;
          await this.plugin.dataManager.deleteFile(d.file);
          void refreshAll();
        };

        row.onclick = () => {
          new DeudaModal(
            this.plugin.app,
            this.plugin,
            () => { void refreshAll(); },
            data,
            d.file
          ).open();
        };
      }
    };

    searchInput.oninput = render;
    filterClase.onchange = render;
    filterEstado.onchange = render;
    render();
  }

  async onClose() {
    this.contentEl.empty();
  }
}


