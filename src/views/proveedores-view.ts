import { ItemView, WorkspaceLeaf } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { ProveedorData } from "../types";
import { ProveedorModal } from "../modals/proveedor-modal";
import { VIEW_TYPE_DASHBOARD } from "./dashboard-view";
import { exportProveedoresCSV, downloadCSV } from "../utils/export";
import { t as i18n } from "../i18n";

export const VIEW_TYPE_PROVEEDORES = "ordermanager-proveedores";

export class ProveedoresView extends ItemView {
  plugin: OrderManagerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: OrderManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_PROVEEDORES;
  }

  getDisplayText(): string {
    return "Proveedores";
  }

  getIcon(): string {
    return "truck";
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const container = this.contentEl;
    container.empty();

    container.createEl("h2", { text: i18n("suppliers") });

    const backBtn = container.createEl("button", {
      text: i18n("backToDashboard"),
      cls: "ordermanager-toolbar",
    });
    backBtn.style.cssText =
      "margin-bottom:12px;padding:6px 14px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-secondary);color:var(--text-muted);cursor:pointer;font-size:0.85em;";
    backBtn.onclick = () => this.plugin.activateView(VIEW_TYPE_DASHBOARD);

    const toolbar = container.createDiv({ cls: "ordermanager-toolbar" });

    const searchInput = toolbar.createEl("input", {
      type: "text",
      placeholder: "Buscar proveedor...",
    });

    toolbar.createEl("button", { text: i18n("newSupplier"), cls: "" }).onclick = () => {
      new ProveedorModal(this.plugin.app, this.plugin, () => this.refresh()).open();
    };

    toolbar.createEl("button", { text: "CSV", cls: "secondary" }).onclick = () => {
      const csv = exportProveedoresCSV(sorted);
      downloadCSV(csv, `proveedores-${new Date().toISOString().split("T")[0]}.csv`);
    };

    const proveedores = await this.plugin.dataManager.getProveedores();
    const sorted = [...proveedores].sort((a, b) =>
      a.data.nombre.localeCompare(b.data.nombre)
    );

    const tableWrapper = container.createDiv();
    const render = () => {
      tableWrapper.empty();
      const search = searchInput.value.toLowerCase();

      const filtered = sorted.filter((p) => {
        if (!search) return true;
        const n = (p.data.nombre || "").toLowerCase();
        const r = (p.data.ruc || "").toLowerCase();
        const e = (p.data.email || "").toLowerCase();
        return n.includes(search) || r.includes(search) || e.includes(search);
      });

      if (filtered.length === 0) {
        const empty = tableWrapper.createDiv({ cls: "ordermanager-empty" });
        empty.createEl("h3", { text: i18n("noSuppliers") });
        empty.createEl("p", { text: i18n("noSuppliersDesc") });
        return;
      }

      const table = tableWrapper.createEl("table", { cls: "ordermanager-table" });
      const thead = table.createEl("thead");
      const hr = thead.createEl("tr");
      for (const h of ["Nombre", "RUC", "Email", "Teléfono", "Categoría", ""]) {
        hr.createEl("th", { text: h });
      }

      const tbody = table.createEl("tbody");
      for (const p of filtered) {
        const d = p.data;
        const row = tbody.createEl("tr", { cls: "clickable-row" });
        row.createEl("td", { text: d.nombre });
        row.createEl("td", { text: d.ruc || "—" });
        row.createEl("td", { text: d.email || "—" });
        row.createEl("td", { text: d.telefono || "—" });
        row.createEl("td", { text: d.categoria || "—" });

        const actionTd = row.createEl("td");
        const delBtn = actionTd.createEl("button", { text: "×" });
        delBtn.style.cssText =
          "padding:2px 8px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;font-size:1em;line-height:1;";
        delBtn.onclick = async (e: MouseEvent) => {
          e.stopPropagation();
          if (!confirm("¿Eliminar este proveedor?")) return;
          await this.plugin.dataManager.deleteFile(p.file);
          this.refresh();
        };

        row.onclick = () => {
          new ProveedorModal(
            this.plugin.app,
            this.plugin,
            () => this.refresh(),
            d,
            p.file
          ).open();
        };
      }
    };

    searchInput.oninput = render;
    render();
  }

  async onClose() {
    this.contentEl.empty();
  }
}
