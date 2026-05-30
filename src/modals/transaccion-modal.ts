import { App, Modal, Notice, Setting, DropdownComponent, TFile } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { TransaccionData, TransaccionClase, DeudaData } from "../types";
import { MONEDA_SOURCES } from "../types";
import { today, now } from "../utils/date";
import { convertir } from "../utils/exchange";
import { formatCurrency } from "../utils/currency";
import { t } from "../i18n";

function esCategoriaDeuda(cat: string): boolean {
  return /deuda/i.test(cat);
}

export class TransaccionModal extends Modal {
  plugin: OrderManagerPlugin;
  data: Partial<TransaccionData>;
  existingFile: TFile | null;
  onSubmit: () => void;
  clientes: Array<{ nombre: string }> = [];
  proveedores: Array<{ nombre: string }> = [];
  productos: Array<{ nombre: string }> = [];
  deudas: Array<{ file: TFile; data: DeudaData }> = [];

  private selectedDebtFile: TFile | null = null;
  private montoInput!: HTMLInputElement;
  private monedaDd!: DropdownComponent;
  private clienteDd!: DropdownComponent;
  private proveedorDd!: DropdownComponent;
  private descripcionInput!: HTMLTextAreaElement;

  constructor(
    app: App,
    plugin: OrderManagerPlugin,
    onSubmit: () => void,
    existing?: TransaccionData,
    file?: TFile
  ) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.existingFile = file || null;
    this.data = existing
      ? { ...existing }
      : {
          tipo: "transaccion",
          clase: "ingreso",
          monto: 0,
          moneda: plugin.settings.defaultCurrency,
          fecha: today(),
          categoria: "",
          cliente: "",
          proveedor: "",
          descripcion: "",
          medio_pago: "",
          comprobante: "",
          estado: "confirmado",
          deuda_ref: "",
          created: now(),
        };
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    contentEl.createEl("h3", {
      text: this.existingFile ? t("editTransaction") : t("newTransactionTitle"),
    });

    this.clientes = (await this.plugin.dataManager.getClientes()).map((c) => c.data);
    this.proveedores = (await this.plugin.dataManager.getProveedores()).map((p) => p.data);
    this.productos = (await this.plugin.dataManager.getProductos()).map((p) => p.data);
    this.deudas = await this.plugin.dataManager.getDeudas();

    if (this.data.deuda_ref && !this.existingFile) {
      this.data.deuda_ref = "";
    }

    const form = contentEl.createDiv();
    let categoriaContainer: HTMLElement;
    let deudaContainer: HTMLElement;

    const buildCategoriaDropdown = (container: HTMLElement) => {
      container.empty();
      new Setting(container)
        .setName(t("category"))
        .addDropdown((dd: DropdownComponent) => {
          dd.addOption("", "—");
          const cats =
            this.data.clase === "ingreso"
              ? this.plugin.settings.categoriasIngreso
              : this.plugin.settings.categoriasEgreso;
          for (const cat of cats) {
            dd.addOption(cat, cat);
          }
          dd.setValue(this.data.categoria || "");
          dd.onChange((v) => {
            this.data.categoria = v;
            if (!esCategoriaDeuda(v)) {
              this.data.deuda_ref = "";
              this.selectedDebtFile = null;
            }
            buildDeudaSection();
          });
        });
    };

    const buildDeudaSection = () => {
      deudaContainer.empty();
      const cat = this.data.categoria || "";
      if (!esCategoriaDeuda(cat)) return;

      console.log("OrderManager: buildDeudaSection — clase:", this.data.clase, "categoria:", cat, "total deudas:", this.deudas.length);

      const claseFiltro = this.data.clase === "ingreso" ? "a_favor" : "en_contra";
      const deudasPendientes = this.deudas.filter(
        (d) =>
          d.data.clase === claseFiltro &&
          d.data.estado !== "pagada" &&
          (d.data.monto_total || 0) > (d.data.monto_pagado || 0)
      );

      console.log("OrderManager: deudasPendientes encontradas:", deudasPendientes.length, "filtro clase:", claseFiltro);

      if (deudasPendientes.length === 0) {
        deudaContainer.createEl("p", {
          text: t("noDebtsAvailable"),
          cls: "ordermanager-text-muted",
        });
        (deudaContainer.querySelector("p") as HTMLElement).style.cssText =
          "font-size:0.85em;color:var(--text-muted);margin:8px 0;";
        return;
      }

      new Setting(deudaContainer)
        .setName(t("selectDebt"))
        .addDropdown((dd: DropdownComponent) => {
          dd.addOption("", "—");
          for (const d of deudasPendientes) {
            const restante = (d.data.monto_total || 0) - (d.data.monto_pagado || 0);
            const label = `${d.data.descripcion || "Deuda"} (${formatCurrency(restante, d.data.moneda)})`;
            dd.addOption(d.file.path, label);
          }

          if (this.data.deuda_ref) {
            dd.setValue(this.data.deuda_ref);
          }

          dd.onChange((filePath) => {
            if (!filePath) {
              this.data.deuda_ref = "";
              this.selectedDebtFile = null;
              return;
            }
            const match = deudasPendientes.find((d) => d.file.path === filePath);
            if (!match) return;

            this.data.deuda_ref = filePath;
            this.selectedDebtFile = match.file;
            const debt = match.data;
            const restante = (debt.monto_total || 0) - (debt.monto_pagado || 0);

            this.data.monto = restante;
            this.montoInput.value = String(restante);

            this.data.moneda = debt.moneda;
            try { this.monedaDd.setValue(debt.moneda); } catch { /* moneda fuera de tasas */ }

            if (debt.clase === "a_favor") {
              this.data.cliente = debt.cliente;
              this.data.proveedor = "";
              try { this.clienteDd.setValue(debt.cliente); } catch { /* */ }
              try { this.proveedorDd.setValue(""); } catch { /* */ }
            } else {
              this.data.proveedor = debt.proveedor;
              this.data.cliente = "";
              try { this.proveedorDd.setValue(debt.proveedor); } catch { /* */ }
              try { this.clienteDd.setValue(""); } catch { /* */ }
            }

            this.data.descripcion = `Abono: ${debt.descripcion || "Deuda"}`;
            this.descripcionInput.value = this.data.descripcion;
          });
        });
    };

    new Setting(form)
      .setName(t("type"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("ingreso", t("income"));
        dd.addOption("egreso", t("expense"));
        dd.setValue(this.data.clase || "ingreso");
        dd.onChange((v) => {
          this.data.clase = v as TransaccionClase;
          this.data.categoria = "";
          this.data.deuda_ref = "";
          this.selectedDebtFile = null;
          buildCategoriaDropdown(categoriaContainer);
          buildDeudaSection();
        });
      });

    new Setting(form).setName(t("amount")).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.step = "0.01";
      text.setValue(String(this.data.monto || 0)).onChange((v) => {
        this.data.monto = parseFloat(v) || 0;
      });
      this.montoInput = text.inputEl;
    });

    new Setting(form)
      .setName(t("currency"))
      .addDropdown((dd: DropdownComponent) => {
        const monedas = Object.keys(this.plugin.settings.tasasCambio || {}).filter((k) => !k.startsWith("_"));
        if (monedas.length === 0) monedas.push("USD");
        for (const m of monedas) {
          const source = MONEDA_SOURCES.find((s) => s.code === m);
          dd.addOption(m, source?.label || m);
        }
        const monedaActual = this.data.moneda || this.plugin.settings.defaultCurrency;
        if (!monedas.includes(monedaActual)) {
          dd.addOption(monedaActual, monedaActual);
        }
        dd.setValue(monedaActual);
        dd.onChange((v) => (this.data.moneda = v));
        this.monedaDd = dd;
      });

    new Setting(form).setName(t("date")).addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.data.fecha || today()).onChange((v) => (this.data.fecha = v));
    });

    categoriaContainer = form.createDiv();
    buildCategoriaDropdown(categoriaContainer);

    deudaContainer = form.createDiv();
    buildDeudaSection();

    new Setting(form)
      .setName(t("clientDebtor"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const c of this.clientes) {
          dd.addOption(c.nombre, c.nombre);
        }
        dd.setValue(this.data.cliente || "");
        dd.onChange((v) => (this.data.cliente = v));
        this.clienteDd = dd;
      });

    new Setting(form)
      .setName(t("supplierCreditor"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const p of this.proveedores) {
          dd.addOption(p.nombre, p.nombre);
        }
        dd.setValue(this.data.proveedor || "");
        dd.onChange((v) => (this.data.proveedor = v));
        this.proveedorDd = dd;
      });

    new Setting(form)
      .setName(t("product"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const p of this.productos) {
          dd.addOption(p.nombre, p.nombre);
        }
        dd.setValue(this.data.producto || "");
        dd.onChange((v) => (this.data.producto = v));
      });

    new Setting(form).setName(t("description")).addTextArea((text) => {
      text.setValue(this.data.descripcion || "").onChange((v) => (this.data.descripcion = v));
      this.descripcionInput = text.inputEl;
    });

    new Setting(form)
      .setName(t("paymentMethod"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const m of this.plugin.settings.mediosPago) {
          dd.addOption(m, m);
        }
        dd.setValue(this.data.medio_pago || "");
        dd.onChange((v) => (this.data.medio_pago = v));
      });

    const compRow = form.createDiv({ cls: "setting-item" });
    const compInfo = compRow.createDiv({ cls: "setting-item-info" });
    compInfo.createDiv({ cls: "setting-item-name", text: t("receipt") });
    const compControl = compRow.createDiv({ cls: "setting-item-control" });

    const renderComprobante = () => {
      compControl.empty();
      if (this.data.comprobante) {
        const fileName = this.data.comprobante.split("/").pop() || this.data.comprobante;
        const link = compControl.createEl("a", { text: fileName });
        link.style.cssText =
          "color:var(--interactive-accent);cursor:pointer;text-decoration:underline;margin-right:8px;font-size:0.9em;";
        link.onclick = () => {
          this.app.workspace.openLinkText(this.data.comprobante!, "", false);
        };

        const changeBtn = compControl.createEl("button", { text: "Cambiar" });
        changeBtn.style.cssText = "padding:4px 8px;font-size:0.85em;margin-right:6px;";
        changeBtn.onclick = () => pickFile();

        const removeBtn = compControl.createEl("button", { text: "×" });
        removeBtn.style.cssText =
          "padding:2px 8px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;font-size:0.85em;line-height:1.2;";
        removeBtn.onclick = async () => {
          await this.plugin.dataManager.deleteComprobante(this.data.comprobante!);
          this.data.comprobante = "";
          renderComprobante();
        };
      } else {
        const span = compControl.createEl("span", { text: "Sin adjuntar" });
        span.style.cssText = "color:var(--text-muted);font-size:0.85em;margin-right:8px;";
        const attachBtn = compControl.createEl("button", { text: "Adjuntar" });
        attachBtn.style.cssText = "padding:4px 8px;font-size:0.85em;";
        attachBtn.onclick = () => pickFile();
      }
    };

    const pickFile = () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip";
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (this.data.comprobante) {
          await this.plugin.dataManager.deleteComprobante(this.data.comprobante);
        }
        const arrayBuffer = await file.arrayBuffer();
        const vaultPath = await this.plugin.dataManager.saveComprobante(arrayBuffer, file.name);
        this.data.comprobante = vaultPath;
        renderComprobante();
      };
      fileInput.click();
    };

    renderComprobante();

    const recRow = form.createDiv({ cls: "ordermanager-form-row" });
    new Setting(recRow.createDiv())
      .setName("Recurrente")
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "No");
        dd.addOption("semanal", "Semanal");
        dd.addOption("quincenal", "Quincenal");
        dd.addOption("mensual", "Mensual");
        dd.addOption("anual", "Anual");
        dd.setValue(this.data.recurrente || "");
        dd.onChange((v) => (this.data.recurrente = v));
      });
    new Setting(recRow.createDiv())
      .setName("Válido hasta")
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.data.recurrente_hasta || "");
        text.onChange((v) => (this.data.recurrente_hasta = v));
      });

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: t("cancel"), cls: "secondary" }).onclick = () =>
      this.close();
    if (this.existingFile) {
      actions.createEl("button", { text: t("delete"), cls: "danger" }).onclick = async () => {
        if (!confirm("¿Eliminar esta transacción?")) return;
        await this.plugin.dataManager.deleteTransaccion(this.existingFile!);
        this.onSubmit();
        this.close();
      };
    }
    actions.createEl("button", { text: t("save"), cls: "primary" }).onclick = async () => {
      if (!(this.data.monto && this.data.monto > 0)) {
        new Notice(t("amountRequired"));
        return;
      }
      const ref = this.plugin.settings.tasaReferencia || "USD";
      const rates = this.plugin.settings.tasasCambio || { USD: 1 };
      this.data.monto_referencia = convertir(this.data.monto || 0, this.data.moneda || "USD", rates, ref);

      await this.plugin.dataManager.saveTransaccion(
        this.data,
        this.existingFile || undefined
      );

      if (this.data.deuda_ref && this.selectedDebtFile) {
        const deudaFile = this.selectedDebtFile;
        try {
          const freshDeudas = await this.plugin.dataManager.getDeudas();
          const fresh = freshDeudas.find((d) => d.file.path === deudaFile.path);
          if (fresh) {
            const debt = fresh.data;
            const newPagado = (debt.monto_pagado || 0) + (this.data.monto || 0);
            const updated = newPagado >= (debt.monto_total || 0) ? "pagada" : debt.estado;
            await this.plugin.dataManager.saveDeuda(
              { ...debt, monto_pagado: newPagado, estado: updated },
              deudaFile
            );
          }
        } catch (err) {
          console.error("OrderManager: error al actualizar deuda vinculada", err);
        }
      }

      this.onSubmit();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
