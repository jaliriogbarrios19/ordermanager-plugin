import { ItemView, WorkspaceLeaf } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { ProductoData } from "../types";
import { ProductoModal } from "../modals/producto-modal";
import { formatCurrency } from "../utils/currency";
import { VIEW_TYPE_DASHBOARD } from "./dashboard-view";
import { exportProductosCSV, downloadCSV } from "../utils/export";
import { t as i18n } from "../i18n";

export const VIEW_TYPE_INVENTARIO = "ordermanager-inventario";

export class InventarioView extends ItemView {
  plugin: OrderManagerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: OrderManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_INVENTARIO;
  }

  getDisplayText(): string {
    return "Inventario";
  }

  getIcon(): string {
    return "package";
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const container = this.contentEl;
    container.empty();

    container.createEl("h2", { text: i18n("inventory") });
    const backBtn = container.createEl("button", { text: i18n("backToDashboard"),
      cls: "ordermanager-toolbar",
    });
    backBtn.style.cssText =
      "margin-bottom:12px;padding:6px 14px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-secondary);color:var(--text-muted);cursor:pointer;font-size:0.85em;";
    backBtn.onclick = () => this.plugin.activateView(VIEW_TYPE_DASHBOARD);

    const toolbar = container.createDiv({ cls: "ordermanager-toolbar" });

    const searchInput = toolbar.createEl("input", {
      type: "text",
      placeholder: "Buscar producto...",
    });

    const filterCat = toolbar.createEl("select");
    filterCat.createEl("option", { text: "Todas las categorías", value: "" });
    for (const cat of this.plugin.settings.categoriasProducto) {
      filterCat.createEl("option", { text: cat, value: cat });
    }

    toolbar.createEl("button", { text: i18n("newProduct"), cls: "" }).onclick = () => {
      new ProductoModal(this.plugin.app, this.plugin, () => this.refresh()).open();
    };

    toolbar.createEl("button", { text: "CSV", cls: "secondary" }).onclick = () => {
      const csv = exportProductosCSV(sorted);
      downloadCSV(csv, `productos-${new Date().toISOString().split("T")[0]}.csv`);
    };

    const productos = await this.plugin.dataManager.getProductos();
    const sorted = [...productos].sort((a, b) =>
      a.data.nombre.localeCompare(b.data.nombre)
    );

    const tableWrapper = container.createDiv();
    const render = () => {
      tableWrapper.empty();
      const search = searchInput.value.toLowerCase();
      const cat = filterCat.value;

      const filtered = sorted.filter((p) => {
        if (search) {
          const n = (p.data.nombre || "").toLowerCase();
          const d = (p.data.descripcion || "").toLowerCase();
          if (!n.includes(search) && !d.includes(search)) return false;
        }
        if (cat && p.data.categoria !== cat) return false;
        return true;
      });

      if (filtered.length === 0) {
        const empty = tableWrapper.createDiv({ cls: "ordermanager-empty" });
        empty.createEl("h3", { text: i18n("noProducts") });
        empty.createEl("p", { text: i18n("noProductsDesc") });
        return;
      }

      const table = tableWrapper.createEl("table", { cls: "ordermanager-table" });
      const thead = table.createEl("thead");
      const hr = thead.createEl("tr");
      for (const h of [
        "Nombre",
        "Precio costo",
        "Precio venta",
        "Margen",
        "Stock",
        "Categoría",
        "Proveedor",
        "",
      ]) {
        hr.createEl("th", { text: h });
      }

      const tbody = table.createEl("tbody");
      for (const p of filtered) {
        const d = p.data;
        const cost = d.precio_costo || 0;
        const sale = d.precio_venta || 0;
        const margin = sale > 0 ? (((sale - cost) / sale) * 100) : 0;

        const row = tbody.createEl("tr", { cls: "clickable-row" });
        row.createEl("td", { text: d.nombre });
        row.createEl("td", {
          text: cost === 0 ? "Prod. propia" : formatCurrency(cost, d.moneda),
        });
        row.createEl("td", { text: formatCurrency(sale, d.moneda) });
        row.createEl("td", {
          text: cost === 0 ? "—" : `${margin.toFixed(0)}%`,
        });
        const stockVal = d.stock ?? 0;
        const stockMin = d.stock_minimo ?? 0;
        const stockEl = row.createEl("td");
        if (stockMin > 0 && stockVal <= stockMin) {
          stockEl.style.cssText = "color:var(--color-red);font-weight:700;";
          stockEl.setText(`${stockVal} ⚠`);
        } else {
          stockEl.setText(String(stockVal));
        }
        row.createEl("td", { text: d.categoria || "—" });
        row.createEl("td", { text: d.proveedor || "—" });

        const actionTd = row.createEl("td");
        const delBtn = actionTd.createEl("button", { text: "×" });
        delBtn.style.cssText =
          "padding:2px 8px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;font-size:1em;line-height:1;";
        delBtn.onclick = async (e: MouseEvent) => {
          e.stopPropagation();
          if (!confirm("¿Eliminar este producto?")) return;
          await this.plugin.dataManager.deleteFile(p.file);
          this.refresh();
        };

        row.onclick = () => {
          new ProductoModal(
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
    filterCat.onchange = render;
    render();
  }

  async onClose() {
    this.contentEl.empty();
  }
}
