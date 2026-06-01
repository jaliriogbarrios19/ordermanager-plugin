import { App, Modal, Notice } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { TransaccionData, ClienteData } from "../types";
import { formatCurrency } from "../utils/currency";
import { formatDate } from "../utils/date";
import { t } from "../i18n";

export class TicketModal extends Modal {
  plugin: OrderManagerPlugin;
  transaccion: TransaccionData;
  cliente?: ClienteData;

  constructor(
    app: App,
    plugin: OrderManagerPlugin,
    transaccion: TransaccionData,
    cliente?: ClienteData
  ) {
    super(app);
    this.plugin = plugin;
    this.transaccion = transaccion;
    this.cliente = cliente;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    contentEl.createEl("h3", { text: t("ticketTitle") });

    const d = this.transaccion;
    const c = this.cliente;

    const ticket = contentEl.createDiv({ cls: "ordermanager-ticket" });
    ticket.style.cssText =
      "font-family:-apple-system,sans-serif;padding:16px;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:8px;max-width:380px;margin:0 auto;";

    const header = ticket.createDiv();
    header.style.cssText = "text-align:center;margin-bottom:12px;";
    header.createEl("h2", { text: "OrderManager" });
    header.createEl("p", {
      text: t("ticketTitle"),
      cls: "ordermanager-text-muted",
    });
    const h2El = header.querySelector("h2") as HTMLElement;
    if (h2El) h2El.style.cssText = "margin:0;font-size:1.2em;";

    const divider1 = ticket.createEl("hr");
    divider1.style.cssText =
      "border:none;border-top:1px dashed var(--background-modifier-border);margin:8px 0;";

    const fields = ticket.createDiv();
    fields.style.cssText = "font-size:0.9em;line-height:1.8;";

    this.addField(fields, t("date"), formatDate(d.fecha));
    this.addField(fields, t("clientDebtor"), d.cliente || c?.nombre || "\u2014");
    const productos = d.productos && d.productos.length > 0
      ? d.productos
      : d.producto
        ? [{ nombre: d.producto, cantidad: 1, precio_unitario: d.monto || 0 }]
        : [];
    if (productos.length > 0) {
      const prodHeader = fields.createDiv();
      prodHeader.style.cssText = "margin-top:4px;";
      prodHeader.createSpan({
        text: t("products"),
        cls: "ordermanager-text-muted",
      });
      const prodLabel = prodHeader.querySelector(".ordermanager-text-muted") as HTMLElement;
      if (prodLabel) prodLabel.style.cssText = "color:var(--text-muted);font-size:0.85em;";
      for (const p of productos) {
        this.addField(fields, `  ${p.nombre}`, `${p.cantidad} × ${formatCurrency(p.precio_unitario, d.moneda)}`);
      }
    }
    this.addField(fields, t("description"), d.descripcion || "\u2014");

    const amountRow = fields.createDiv();
    amountRow.style.cssText = "display:flex;justify-content:space-between;font-weight:bold;font-size:1.1em;margin:8px 0;";
    amountRow.createSpan({ text: t("amount") });
    amountRow.createSpan({ text: formatCurrency(d.monto || 0, d.moneda) });

    this.addField(fields, t("paymentMethod"), d.medio_pago || "\u2014");

    if (d.clase === "egreso") {
      const creditRow = fields.createDiv();
      creditRow.style.cssText = "text-align:center;color:var(--color-red);font-weight:bold;margin:8px 0;";
      creditRow.createSpan({ text: t("creditPurchase") });
    }

    const divider2 = ticket.createEl("hr");
    divider2.style.cssText =
      "border:none;border-top:1px dashed var(--background-modifier-border);margin:8px 0;";

    const footer = ticket.createDiv();
    footer.style.cssText = "text-align:center;color:var(--text-muted);font-size:0.85em;";
    footer.createEl("p", { text: t("thankYou") });

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.style.cssText = "margin-top:16px;";

    actions.createEl("button", { text: t("share"), cls: "primary" }).onclick = async () => {
      await this.shareTicket();
    };

    actions.createEl("button", { text: t("downloadImage") }).onclick = async () => {
      await this.downloadTicketImage();
    };

    actions.createEl("button", { text: t("cancel"), cls: "secondary" }).onclick = () =>
      this.close();
  }

  private addField(container: HTMLElement, label: string, value: string) {
    const row = container.createDiv();
    row.style.cssText = "display:flex;justify-content:space-between;";
    row.createSpan({ text: label, cls: "ordermanager-text-muted" });
    row.createSpan({ text: value });
    const labelEl = row.querySelector(".ordermanager-text-muted") as HTMLElement;
    if (labelEl) labelEl.style.cssText = "color:var(--text-muted);";
  }

  private getTicketText(): string {
    const d = this.transaccion;
    const productos = d.productos && d.productos.length > 0
      ? d.productos
      : d.producto
        ? [{ nombre: d.producto, cantidad: 1, precio_unitario: d.monto || 0 }]
        : [];
    const prodLines = productos.map(
      (p) => `  ${p.nombre}: ${p.cantidad} × ${formatCurrency(p.precio_unitario, d.moneda)}`
    );
    return [
      "OrderManager \u2014 Ticket",
      `${t("date")}: ${formatDate(d.fecha)}`,
      `${t("clientDebtor")}: ${d.cliente || "\u2014"}`,
      ...(productos.length > 0 ? [`${t("products")}:`, ...prodLines] : [`${t("product")}: ${d.producto || "\u2014"}`]),
      `${t("description")}: ${d.descripcion || "\u2014"}`,
      `${t("amount")}: ${formatCurrency(d.monto || 0, d.moneda)}`,
      `${t("paymentMethod")}: ${d.medio_pago || "\u2014"}`,
      d.clase === "egreso" ? t("creditPurchase") : "",
      t("thankYou"),
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async generateImage(): Promise<Blob> {
    const d = this.transaccion;
    const productos = d.productos && d.productos.length > 0
      ? d.productos
      : d.producto
        ? [{ nombre: d.producto, cantidad: 1, precio_unitario: d.monto || 0 }]
        : [];
    const prodImgLines = productos.map((p) => ({
      text: `  ${p.nombre}: ${p.cantidad} × ${formatCurrency(p.precio_unitario, d.moneda)}`,
      font: "12px -apple-system, sans-serif",
      center: false as const,
    }));
    const lines: Array<{ text: string; font: string; center: boolean }> = [
      { text: "OrderManager", font: "bold 18px -apple-system, sans-serif", center: true },
      { text: t("ticketTitle"), font: "14px -apple-system, sans-serif", center: true },
      { text: "", font: "10px -apple-system, sans-serif", center: false },
      { text: `${t("date")}: ${formatDate(d.fecha)}`, font: "13px -apple-system, sans-serif", center: false },
      { text: `${t("clientDebtor")}: ${d.cliente || "\u2014"}`, font: "13px -apple-system, sans-serif", center: false },
      ...(productos.length > 0
        ? [
            { text: t("products"), font: "12px -apple-system, sans-serif", center: false as const },
            ...prodImgLines,
          ]
        : [{ text: `${t("product")}: ${d.producto || "\u2014"}`, font: "13px -apple-system, sans-serif", center: false as const }]),
      { text: `${t("description")}: ${d.descripcion || "\u2014"}`, font: "13px -apple-system, sans-serif", center: false },
      { text: `${t("amount")}: ${formatCurrency(d.monto || 0, d.moneda)}`, font: "bold 15px -apple-system, sans-serif", center: false },
      { text: `${t("paymentMethod")}: ${d.medio_pago || "\u2014"}`, font: "13px -apple-system, sans-serif", center: false },
      { text: "", font: "10px -apple-system, sans-serif", center: false },
      ...(d.clase === "egreso"
        ? [{ text: t("creditPurchase"), font: "bold 13px -apple-system, sans-serif", center: true } as const]
        : []),
      { text: "", font: "10px -apple-system, sans-serif", center: false },
      { text: t("thankYou"), font: "12px -apple-system, sans-serif", center: true },
    ];

    const width = 380;
    const padding = 18;
    const lineHeight = 22;
    const nonEmpty = lines.filter((l) => l.text);
    const height = nonEmpty.length * lineHeight + padding * 2 + 20;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    let y = padding + lineHeight;
    for (const line of lines) {
      if (!line.text) {
        y += lineHeight / 2;
        continue;
      }
      ctx.font = line.font;
      ctx.fillStyle = "#1a1a1a";
      if (line.center) {
        ctx.textAlign = "center";
        ctx.fillText(line.text, width / 2, y);
        ctx.textAlign = "start";
      } else {
        ctx.fillText(line.text, padding, y);
      }
      y += lineHeight;
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), "image/png");
    });
  }

  private async shareTicket() {
    try {
      const blob = await this.generateImage();
      const file = new File([blob], `ticket-${this.transaccion.fecha}.png`, {
        type: "image/png",
      });

      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: "OrderManager \u2014 Ticket",
          files: [file],
        });
      } else if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "OrderManager \u2014 Ticket",
          text: this.getTicketText(),
        });
      } else {
        await this.downloadTicketImage();
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        await this.downloadTicketImage();
      }
    }
  }

  private async downloadTicketImage() {
    const blob = await this.generateImage();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${this.transaccion.fecha}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    new Notice(t("ticketSaved"));
  }

  onClose() {
    this.contentEl.empty();
  }
}
