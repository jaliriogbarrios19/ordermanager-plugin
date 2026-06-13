import { App, Modal, Setting } from "obsidian";
import { formatCurrency } from "../utils/currency";
import { formatDate } from "../utils/date";
import type { DeudaData } from "../types";

export class DeudasModal extends Modal {
  private titulo: string;
  private deudas: Array<{ data: DeudaData }>;
  private ref: string;

  constructor(
    app: App,
    titulo: string,
    deudas: Array<{ data: DeudaData }>,
    ref: string
  ) {
    super(app);
    this.titulo = titulo;
    this.deudas = deudas;
    this.ref = ref;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    new Setting(contentEl).setName(this.titulo).setHeading();

    if (this.deudas.length === 0) {
      contentEl.createEl("p", {
        text: "No hay deudas pendientes.",
        cls: "ordermanager-text-muted",
      });
      return;
    }

    const table = contentEl.createEl("table", { cls: "ordermanager-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    for (const h of ["Descripción", "Tipo", "Total", "Pagado", "Restante", "Moneda", "Vencimiento", "Contacto"]) {
      headerRow.createEl("th", { text: h });
    }

    const tbody = table.createEl("tbody");
    let totalRestante = 0;
    for (const d of this.deudas) {
      const data = d.data;
      const restante = (data.monto_total || 0) - (data.monto_pagado || 0);
      totalRestante += restante;

      const row = tbody.createEl("tr");
      row.createEl("td", { text: data.descripcion || "—" });
      row.createEl("td", {
        text: data.clase === "a_favor" ? "A favor" : "En contra",
        cls: `ordermanager-badge ${data.clase === "a_favor" ? "positive" : "negative"}`,
      });
      row.createEl("td", { text: formatCurrency(data.monto_total || 0, data.moneda) });
      row.createEl("td", { text: formatCurrency(data.monto_pagado || 0, data.moneda) });
      row.createEl("td", { text: formatCurrency(restante, data.moneda) });
      row.createEl("td", { text: data.moneda || "—" });
      row.createEl("td", { text: data.fecha_vencimiento ? formatDate(data.fecha_vencimiento) : "—" });
      row.createEl("td", { text: data.cliente || data.proveedor || "—" });
    }

    const footer = contentEl.createDiv();
    footer.setCssProps({ marginTop: "12px", textAlign: "right", fontWeight: "600" });
    footer.createEl("p", { text: `Total pendiente: ${formatCurrency(totalRestante, this.ref)}` });

    const closeBtn = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    closeBtn.createEl("button", { text: "Cerrar", cls: "secondary" }).onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
