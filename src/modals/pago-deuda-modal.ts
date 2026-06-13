import { Modal, App, Setting } from "obsidian";
import { formatCurrency } from "../utils/currency";

export class PagoDeudaModal extends Modal {
  private onSubmit: (amount: number | null) => void;
  private restante: number;
  private moneda: string;

  constructor(
    app: App,
    restante: number,
    moneda: string,
    onSubmit: (amount: number | null) => void
  ) {
    super(app);
    this.restante = restante;
    this.moneda = moneda;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    new Setting(contentEl).setName("Registrar pago").setHeading();
    contentEl.createEl("p", {
      text: `Restante: ${formatCurrency(this.restante, this.moneda)}`,
    });

    let monto = this.restante;

    new Setting(contentEl)
      .setName("Monto a abonar")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.step = "0.01";
        text.setValue(String(this.restante));
        text.onChange((v) => (monto = parseFloat(v) || 0));
        text.inputEl.onkeydown = (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            const parsed = parseFloat(text.getValue()) || 0;
            this.close();
            this.onSubmit(parsed > 0 ? parsed : null);
          }
        };
      });

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: "Cancelar", cls: "secondary" }).onclick = () => {
      this.close();
      this.onSubmit(null);
    };
    actions.createEl("button", { text: "Registrar", cls: "primary" }).onclick = () => {
      this.close();
      this.onSubmit(monto > 0 ? monto : null);
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
