import { App, Modal, Setting, TFile } from "obsidian";
import { formatCurrency } from "../utils/currency";
import { t as i18n } from "../i18n";
import type { TransaccionData } from "../types";
import { convertir } from "../utils/exchange";

export class TransaccionesModal extends Modal {
  private titulo: string;
  private transacciones: Array<{ file: TFile; data: TransaccionData }>;
  private ref: string;
  private rates: Record<string, number>;

  constructor(
    app: App,
    titulo: string,
    transacciones: Array<{ file: TFile; data: TransaccionData }>,
    ref: string,
    rates: Record<string, number>
  ) {
    super(app);
    this.titulo = titulo;
    this.transacciones = transacciones;
    this.ref = ref;
    this.rates = rates;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    new Setting(contentEl).setName(this.titulo).setHeading();

    if (this.transacciones.length === 0) {
      contentEl.createEl("p", {
        text: "No hay transacciones en este período.",
        cls: "ordermanager-text-muted",
      });
      return;
    }

    const sorted = [...this.transacciones].sort(
      (a, b) => b.data.fecha.localeCompare(a.data.fecha) || b.data.created.localeCompare(a.data.created)
    );

    const table = contentEl.createEl("table", { cls: "ordermanager-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    for (const h of ["Fecha", "Tipo", "Monto", "Moneda", "Categoría", "Descripción"]) {
      headerRow.createEl("th", { text: h });
    }

    const tbody = table.createEl("tbody");
    let total = 0;
    for (const tr of sorted) {
      const d = tr.data;
      const row = tbody.createEl("tr");
      row.createEl("td", { text: d.fecha });
      row.createEl("td", {
        text: d.clase === "ingreso" ? i18n("income") : i18n("expense"),
        cls: `ordermanager-badge ${d.clase}`,
      });
      row.createEl("td", { text: formatCurrency(d.monto || 0, d.moneda || this.ref) });
      row.createEl("td", { text: d.moneda || "—" });
      row.createEl("td", { text: d.categoria || "—" });
      row.createEl("td", { text: d.descripcion || "—" });

      total += d.monto_referencia || convertir(d.monto || 0, d.moneda || "USD", this.rates, this.ref);
    }

    const footer = contentEl.createDiv();
    footer.setCssProps({ marginTop: "12px", textAlign: "right", fontWeight: "600" });
    footer.createEl("p", { text: `Total (${this.ref}): ${formatCurrency(total, this.ref)}` });

    const closeBtn = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    closeBtn.createEl("button", { text: "Cerrar", cls: "secondary" }).onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
