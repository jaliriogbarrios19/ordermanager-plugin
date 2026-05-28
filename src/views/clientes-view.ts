import { ItemView, WorkspaceLeaf, normalizePath } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { ClienteData } from "../types";
import { ClienteModal } from "../modals/cliente-modal";
import { VIEW_TYPE_DASHBOARD } from "./dashboard-view";
import { exportClientesCSV, downloadCSV } from "../utils/export";
import { t as i18n } from "../i18n";

export const VIEW_TYPE_CLIENTES = "ordermanager-clientes";

export class ClientesView extends ItemView {
  plugin: OrderManagerPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: OrderManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CLIENTES;
  }

  getDisplayText(): string {
    return "Clientes";
  }

  getIcon(): string {
    return "users";
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const container = this.contentEl;
    container.empty();

    container.createEl("h2", { text: i18n("clients") });

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
      placeholder: `${i18n("search")}`,
    });

    toolbar.createEl("button", { text: i18n("newClient"), cls: "" }).onclick = () => {
      new ClienteModal(this.plugin.app, this.plugin, () => this.refresh()).open();
    };

    toolbar.createEl("button", { text: "CSV", cls: "secondary" }).onclick = () => {
      const csv = exportClientesCSV(sorted);
      downloadCSV(csv, `clientes-${new Date().toISOString().split("T")[0]}.csv`);
    };

    const clientes = await this.plugin.dataManager.getClientes();
    const sorted = [...clientes].sort((a, b) =>
      a.data.nombre.localeCompare(b.data.nombre)
    );

    const tableWrapper = container.createDiv();
    const render = () => {
      tableWrapper.empty();
      const search = searchInput.value.toLowerCase();

      const filtered = sorted.filter((c) => {
        if (!search) return true;
        const n = (c.data.nombre || "").toLowerCase();
        const r = (c.data.ruc || "").toLowerCase();
        const e = (c.data.email || "").toLowerCase();
        return n.includes(search) || r.includes(search) || e.includes(search);
      });

      if (filtered.length === 0) {
        const empty = tableWrapper.createDiv({ cls: "ordermanager-empty" });
        empty.createEl("h3", { text: i18n("noClients") });
        empty.createEl("p", { text: i18n("noClientsDesc") });
        return;
      }

      const table = tableWrapper.createEl("table", { cls: "ordermanager-table" });
      const thead = table.createEl("thead");
      const hr = thead.createEl("tr");
      for (const h of ["Nombre", "RUC", "Email", "Teléfono", "Categoría", ""]) {
        hr.createEl("th", { text: h });
      }

      const tbody = table.createEl("tbody");
      for (const c of filtered) {
        const d = c.data;
        const row = tbody.createEl("tr", { cls: "clickable-row" });
        row.createEl("td", { text: d.nombre });
        row.createEl("td", { text: d.ruc || "—" });
        row.createEl("td", { text: d.email || "—" });
        row.createEl("td", { text: d.telefono || "—" });
        row.createEl("td", { text: d.categoria || "—" });

        const actionTd = row.createEl("td");
        actionTd.style.cssText = "display:flex;gap:4px;";

        const facturaBtn = actionTd.createEl("button", { text: "📄" });
        facturaBtn.title = "Generar factura";
        facturaBtn.style.cssText =
          "padding:2px 6px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:0.85em;";
        facturaBtn.onclick = async (e: MouseEvent) => {
          e.stopPropagation();
          const allTrans = await this.plugin.dataManager.getTransacciones();
          const clientTrans = allTrans.filter((t) => t.data.cliente === d.nombre);
          const totalIngresos = clientTrans.filter((t) => t.data.clase === "ingreso").reduce((s, t) => s + (t.data.monto || 0), 0);
          const totalEgresos = clientTrans.filter((t) => t.data.clase === "egreso").reduce((s, t) => s + (t.data.monto || 0), 0);
          const deudas = await this.plugin.dataManager.getDeudas();
          const clientDeudas = deudas.filter((t) => t.data.cliente === d.nombre && t.data.estado !== "pagada");

          let content = `---\ntipo: factura\ncliente: ${d.nombre}\nfecha: ${new Date().toISOString().split("T")[0]}\n---\n\n`;
          content += `# Factura — ${d.nombre}\n\n`;
          content += `| Campo | Valor |\n|-------|-------|\n`;
          content += `| RUC | ${d.ruc || "—"} |\n`;
          content += `| Email | ${d.email || "—"} |\n`;
          content += `| Teléfono | ${d.telefono || "—"} |\n`;
          content += `| Dirección | ${d.direccion || "—"} |\n\n`;
          content += `## Transacciones\n\n`;
          if (clientTrans.length > 0) {
            content += `| Fecha | Tipo | Monto | Moneda | Descripción |\n|-------|------|-------|--------|-------------|\n`;
            for (const t of clientTrans) {
              content += `| ${t.data.fecha} | ${t.data.clase === "ingreso" ? "Ingreso" : "Egreso"} | ${t.data.monto} | ${t.data.moneda} | ${t.data.descripcion || "—"} |\n`;
            }
            content += `\n**Total ingresos**: ${totalIngresos}\n**Total egresos**: ${totalEgresos}\n`;
          }
          if (clientDeudas.length > 0) {
            content += `\n## Deudas pendientes\n\n`;
            content += `| Descripción | Total | Pagado | Restante | Vencimiento |\n|-------------|-------|--------|----------|-------------|\n`;
            for (const t of clientDeudas) {
              content += `| ${t.data.descripcion || "—"} | ${t.data.monto_total} | ${t.data.monto_pagado} | ${(t.data.monto_total || 0) - (t.data.monto_pagado || 0)} | ${t.data.fecha_vencimiento || "—"} |\n`;
            }
          }
          if (clientTrans.length === 0 && clientDeudas.length === 0) {
            content += `Sin transacciones registradas.\n`;
          }

          const folder = normalizePath(`${this.plugin.settings.baseFolder}/${this.plugin.settings.libroActivo}/Facturas`);
          await this.plugin.dataManager.ensureFolder(folder);
          const filename = `factura-${d.nombre.replace(/[\\/:*?"<>|]/g, "-")}-${new Date().toISOString().split("T")[0]}`;
          const file = await this.plugin.app.vault.create(normalizePath(`${folder}/${filename}.md`), content);
          this.plugin.app.workspace.getLeaf("tab").openFile(file);
        };

        const delBtn = actionTd.createEl("button", { text: "×" });
        delBtn.style.cssText =
          "padding:2px 8px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;font-size:1em;line-height:1;";
        delBtn.onclick = async (e: MouseEvent) => {
          e.stopPropagation();
          if (!confirm("¿Eliminar este cliente?")) return;
          await this.plugin.dataManager.deleteFile(c.file);
          this.refresh();
        };

        row.onclick = () => {
          new ClienteModal(
            this.plugin.app,
            this.plugin,
            () => this.refresh(),
            d,
            c.file
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
