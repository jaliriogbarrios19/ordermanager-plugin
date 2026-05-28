import { ItemView, WorkspaceLeaf } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { DeudaData } from "../types";
import { DeudaModal } from "../modals/deuda-modal";
import { formatCurrency } from "../utils/currency";
import { formatDate } from "../utils/date";
import { VIEW_TYPE_DASHBOARD } from "./dashboard-view";
import { exportDeudasCSV, downloadCSV } from "../utils/export";
import { t as i18n } from "../i18n";
import { convertir } from "../utils/exchange";

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

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const container = this.contentEl;
    container.empty();

    container.createEl("h2", { text: i18n("debts") });
    const backBtn = container.createEl("button", { text: i18n("backToDashboard"),
      cls: "ordermanager-toolbar",
    });
    backBtn.style.cssText =
      "margin-bottom:12px;padding:6px 14px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-secondary);color:var(--text-muted);cursor:pointer;font-size:0.85em;";
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
    filterEstado.createEl("option", { text: i18n("allStates"), value: "" });
    filterEstado.createEl("option", { text: i18n("pending"), value: "pendiente" });
    filterEstado.createEl("option", { text: i18n("paid"), value: "pagada" });
    filterEstado.createEl("option", { text: i18n("overdue"), value: "vencida" });

    toolbar.createEl("button", { text: i18n("newDebt"), cls: "" }).onclick = () => {
      new DeudaModal(this.plugin.app, this.plugin, () => this.refresh()).open();
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

    const deudoresMap = new Map<string, number>();
    const acreedoresMap = new Map<string, number>();
    for (const d of deudas) {
      if (d.data.estado === "pagada") continue;
      const pendiente = (d.data.monto_total || 0) - (d.data.monto_pagado || 0);
      if (d.data.clase === "a_favor" && d.data.cliente) {
        deudoresMap.set(d.data.cliente, (deudoresMap.get(d.data.cliente) || 0) + pendiente);
      } else if (d.data.clase === "en_contra" && d.data.proveedor) {
        acreedoresMap.set(d.data.proveedor, (acreedoresMap.get(d.data.proveedor) || 0) + pendiente);
      }
    }

    if (deudoresMap.size > 0 || acreedoresMap.size > 0) {
      const summaryDiv = container.createDiv();
      summaryDiv.style.cssText =
        "display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;";

      if (deudoresMap.size > 0) {
        const card = summaryDiv.createDiv();
        card.style.cssText =
          "flex:1;min-width:280px;border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;background:var(--background-secondary);";
        card.createEl("h4", {
          text: "Quiénes me deben",
          cls: "",
        });
        (card.querySelector("h4") as HTMLElement).style.cssText =
          "margin:0 0 8px 0;color:var(--color-green);font-size:0.9em;";
        const sortedDeudores = [...deudoresMap.entries()].sort((a, b) => b[1] - a[1]);
        for (const [nombre, monto] of sortedDeudores) {
          const row = card.createDiv();
          row.style.cssText =
            "display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--background-modifier-border);font-size:0.85em;";
          row.createSpan({ text: nombre });
          row.createSpan({ text: formatCurrency(monto, this.plugin.settings.defaultCurrency) });
        }
      }

      if (acreedoresMap.size > 0) {
        const card = summaryDiv.createDiv();
        card.style.cssText =
          "flex:1;min-width:280px;border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;background:var(--background-secondary);";
        card.createEl("h4", {
          text: "A quiénes les debo",
          cls: "",
        });
        (card.querySelector("h4") as HTMLElement).style.cssText =
          "margin:0 0 8px 0;color:var(--color-red);font-size:0.9em;";
        const sortedAcreedores = [...acreedoresMap.entries()].sort((a, b) => b[1] - a[1]);
        for (const [nombre, monto] of sortedAcreedores) {
          const row = card.createDiv();
          row.style.cssText =
            "display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--background-modifier-border);font-size:0.85em;";
          row.createSpan({ text: nombre });
          row.createSpan({ text: formatCurrency(monto, this.plugin.settings.defaultCurrency) });
        }
      }
    }

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
        if (estado && d.data.estado !== estado) return false;
        return true;
      });

      if (filtered.length === 0) {
        const empty = tableWrapper.createDiv({ cls: "ordermanager-empty" });
        empty.createEl("h3", { text: i18n("noDebts") });
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
        const restante = (data.monto_total || 0) - (data.monto_pagado || 0);

        const row = tbody.createEl("tr", { cls: "clickable-row" });

        row.createEl("td", { text: data.descripcion || "—" });
        row.createEl("td", {
          text: data.clase === "a_favor" ? "A favor" : "En contra",
        });
        row.createEl("td", {
          text: formatCurrency(data.monto_total || 0, data.moneda),
        });
        row.createEl("td", {
          text: formatCurrency(data.monto_pagado || 0, data.moneda),
        });
        row.createEl("td", {
          text: formatCurrency(restante, data.moneda),
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
        actionTd.style.cssText = "display:flex;gap:4px;";

        if (data.estado !== "pagada") {
          const payBtn = actionTd.createEl("button", { text: "$" });
          payBtn.title = "Registrar pago";
          payBtn.style.cssText =
            "padding:2px 6px;border:none;border-radius:4px;background:var(--color-green);color:#fff;cursor:pointer;font-size:0.85em;line-height:1;";
          payBtn.onclick = async (e: MouseEvent) => {
            e.stopPropagation();
            const restante = (data.monto_total || 0) - (data.monto_pagado || 0);
            const amount = prompt(`Monto a abonar (restante: ${formatCurrency(restante, data.moneda)})`, String(restante));
            if (!amount) return;
            const parsed = parseFloat(amount);
            if (isNaN(parsed) || parsed <= 0) return;
            const newPagado = (data.monto_pagado || 0) + parsed;
            const updated = newPagado >= (data.monto_total || 0) ? "pagada" : data.estado;
            await this.plugin.dataManager.saveDeuda(
              { ...data, monto_pagado: newPagado, estado: updated },
              d.file
            );
            const ref = this.plugin.settings.tasaReferencia || "USD";
            const rates = this.plugin.settings.tasasCambio || { USD: 1 };
            await this.plugin.dataManager.saveTransaccion({
              clase: "ingreso",
              monto: parsed,
              monto_referencia: convertir(parsed, data.moneda, rates, ref),
              moneda: data.moneda,
              fecha: new Date().toISOString().split("T")[0],
              categoria: "Cobro de deuda",
              cliente: data.cliente,
              proveedor: data.proveedor,
              descripcion: `Abono: ${data.descripcion || "Deuda"}`,
              estado: "confirmado",
            });
            this.refresh();
          };
        }

        const delBtn = actionTd.createEl("button", { text: "×" });
        delBtn.style.cssText =
          "padding:2px 8px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;font-size:1em;line-height:1;";
        delBtn.onclick = async (e: MouseEvent) => {
          e.stopPropagation();
          if (!confirm("¿Eliminar esta deuda?")) return;
          await this.plugin.dataManager.deleteFile(d.file);
          this.refresh();
        };

        row.onclick = () => {
          new DeudaModal(
            this.plugin.app,
            this.plugin,
            () => this.refresh(),
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
