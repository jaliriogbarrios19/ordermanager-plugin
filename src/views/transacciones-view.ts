import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { TransaccionData } from "../types";
import { formatCurrency } from "../utils/currency";
import { formatDate } from "../utils/date";
import { TransaccionModal } from "../modals/transaccion-modal";
import { exportToCSV, downloadCSV } from "../utils/export";
import { VIEW_TYPE_DASHBOARD } from "./dashboard-view";
import { t as i18n } from "../i18n";

export const VIEW_TYPE_TRANSACCIONES = "ordermanager-transacciones";

export class TransaccionesView extends ItemView {
  plugin: OrderManagerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: OrderManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_TRANSACCIONES;
  }

  getDisplayText(): string {
    return "Transacciones";
  }

  getIcon(): string {
    return "arrow-left-right";
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

    container.createEl("h2", { text: i18n("transactions") });

    const backBtn = container.createEl("button", {
      text: i18n("backToDashboard"),
      cls: "ordermanager-toolbar",
    });
    backBtn.style.cssText =
      "margin-bottom:12px;padding:6px 14px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-secondary);color:var(--text-muted);cursor:pointer;font-size:0.85em;";
    backBtn.onclick = () => this.plugin.activateView(VIEW_TYPE_DASHBOARD);

    const transacciones = await this.plugin.dataManager.getTransacciones();
    const sorted = [...transacciones].sort(
      (a, b) =>
        b.data.fecha.localeCompare(a.data.fecha) ||
        b.data.created.localeCompare(a.data.created)
    );

    const toolbar = container.createDiv({ cls: "ordermanager-toolbar" });

    const filterTipo = toolbar.createEl("select");
    filterTipo.createEl("option", { text: i18n("all"), value: "" });
    filterTipo.createEl("option", { text: i18n("incomes"), value: "ingreso" });
    filterTipo.createEl("option", { text: i18n("expenses"), value: "egreso" });

    const filterCat = toolbar.createEl("select");
    filterCat.createEl("option", { text: i18n("allCategories"), value: "" });
    const allCats = [
      ...this.plugin.settings.categoriasIngreso,
      ...this.plugin.settings.categoriasEgreso,
    ];
    const uniqueCats = [...new Set(allCats)].sort();
    for (const cat of uniqueCats) {
      filterCat.createEl("option", { text: cat, value: cat });
    }

    const searchInput = toolbar.createEl("input", {
      type: "text",
      placeholder: i18n("search"),
    });

    const dateFrom = toolbar.createEl("input", { type: "date" });
    const dateTo = toolbar.createEl("input", { type: "date" });

    let currentFiltered: typeof sorted = sorted;

    toolbar.createEl("button", { text: i18n("newTransaction"), cls: "" }).onclick = () => {
      new TransaccionModal(this.plugin.app, this.plugin, () => this.refresh()).open();
    };

    toolbar.createEl("button", {
      text: i18n("exportCSV"),
      cls: "secondary",
    }).onclick = () => {
      const csv = exportToCSV(currentFiltered.map((t) => ({ data: t.data })));
      downloadCSV(csv, `transacciones-${new Date().toISOString().split("T")[0]}.csv`);
    };

    const tableWrapper = container.createDiv();
    const render = () => {
      tableWrapper.empty();

      const tipo = filterTipo.value;
      const cat = filterCat.value;
      const search = searchInput.value.toLowerCase();
      const from = dateFrom.value;
      const to = dateTo.value;

      currentFiltered = sorted.filter((t) => {
        if (tipo && t.data.clase !== tipo) return false;
        if (cat && t.data.categoria !== cat) return false;
        if (search) {
          const desc = (t.data.descripcion || "").toLowerCase();
          const cli = (t.data.cliente || "").toLowerCase();
          const prov = (t.data.proveedor || "").toLowerCase();
          if (!desc.includes(search) && !cli.includes(search) && !prov.includes(search))
            return false;
        }
        if (from && t.data.fecha < from) return false;
        if (to && t.data.fecha > to) return false;
        return true;
      });

      if (currentFiltered.length === 0) {
        const empty = tableWrapper.createDiv({ cls: "ordermanager-empty" });
        empty.createEl("h3", { text: i18n("noTransactions") });
        empty.createEl("p", { text: i18n("noTransactionsDesc") });
        return;
      }

      const table = tableWrapper.createEl("table", { cls: "ordermanager-table" });
      const thead = table.createEl("thead");
      const headerRow = thead.createEl("tr");
      for (const h of ["Fecha", "Tipo", "Monto", "Moneda", "Categoría", "Cliente/Prov.", "Medio de pago", "Descripción", ""]) {
        headerRow.createEl("th", { text: h });
      }

      const tbody = table.createEl("tbody");
      for (const t of currentFiltered) {
        const d = t.data;
        const row = tbody.createEl("tr", { cls: "clickable-row" });

        row.createEl("td", { text: formatDate(d.fecha) });
        row.createEl("td", {
          text: d.clase === "ingreso" ? i18n("income") : i18n("expense"),
          cls: `ordermanager-badge ${d.clase}`,
        });
        row.createEl("td", {
          text: formatCurrency(d.monto || 0, d.moneda),
        });
        row.createEl("td", { text: d.moneda || "" });
        row.createEl("td", { text: d.categoria || "—" });
        row.createEl("td", { text: d.cliente || d.proveedor || "—" });
        row.createEl("td", { text: d.medio_pago || "—" });
        row.createEl("td", { text: d.descripcion || "—" });

        const actionTd = row.createEl("td");
        const delBtn = actionTd.createEl("button", { text: "×" });
        delBtn.style.cssText =
          "padding:2px 8px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;font-size:1em;line-height:1;";
        delBtn.onclick = async (e: MouseEvent) => {
          e.stopPropagation();
          if (!confirm("¿Eliminar esta transacción?")) return;
          await this.plugin.dataManager.deleteTransaccion(t.file);
          this.refresh();
        };

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
    };

    filterTipo.onchange = render;
    filterCat.onchange = render;
    searchInput.oninput = render;
    dateFrom.onchange = render;
    dateTo.onchange = render;

    render();
  }

  async onClose() {
    this.contentEl.empty();
  }
}
