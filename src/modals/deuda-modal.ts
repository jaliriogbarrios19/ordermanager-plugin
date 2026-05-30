import { App, Modal, Notice, Setting, DropdownComponent } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { DeudaData, DeudaClase, DeudaEstado, DeudaTipo } from "../types";
import { today, now } from "../utils/date";
import { t } from "../i18n";

export class DeudaModal extends Modal {
  plugin: OrderManagerPlugin;
  data: Partial<DeudaData>;
  existingFile: import("obsidian").TFile | null;
  onSubmit: () => void;
  clientes: Array<{ nombre: string }> = [];
  proveedores: Array<{ nombre: string }> = [];
  productos: Array<{ nombre: string }> = [];

  constructor(
    app: App,
    plugin: OrderManagerPlugin,
    onSubmit: () => void,
    existing?: DeudaData,
    file?: import("obsidian").TFile
  ) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.existingFile = file || null;
    this.data = existing
      ? { ...existing }
      : {
          tipo: "deuda",
          clase: "a_favor",
          deuda_tipo: "dinero",
          monto_total: 0,
          monto_pagado: 0,
          moneda: plugin.settings.defaultCurrency,
          fecha_inicio: today(),
          fecha_vencimiento: "",
          cliente: "",
          proveedor: "",
          descripcion: "",
          estado: "pendiente",
          cuotas: 1,
          cuotas_pagadas: 0,
          tasa_interes: 0,
          producto: "",
          cantidad_producto: 0,
          registrar_en_inventario: false,
          created: now(),
          updated: now(),
        };
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    contentEl.createEl("h3", {
      text: this.existingFile ? t("editDebt") : t("newDebtTitle"),
    });

    this.clientes = (await this.plugin.dataManager.getClientes()).map((c) => c.data);
    this.proveedores = (await this.plugin.dataManager.getProveedores()).map((p) => p.data);
    this.productos = (await this.plugin.dataManager.getProductos()).map((p) => p.data);

    const form = contentEl.createDiv();
    let contactContainer: HTMLElement;
    let detailContainer: HTMLElement;
    let inventoryCheckContainer: HTMLElement;

    const buildContactDropdown = (container: HTMLElement) => {
      container.empty();
      if (this.data.clase === "a_favor") {
        new Setting(container)
          .setName(t("clientDebtor"))
          .addDropdown((dd: DropdownComponent) => {
            dd.addOption("", "—");
            for (const c of this.clientes) {
              dd.addOption(c.nombre, c.nombre);
            }
            dd.setValue(this.data.cliente || "");
            dd.onChange((v) => (this.data.cliente = v));
            this.data.proveedor = "";
          });
      } else {
        new Setting(container)
          .setName(t("supplierCreditor"))
          .addDropdown((dd: DropdownComponent) => {
            dd.addOption("", "—");
            for (const p of this.proveedores) {
              dd.addOption(p.nombre, p.nombre);
            }
            dd.setValue(this.data.proveedor || "");
            dd.onChange((v) => (this.data.proveedor = v));
            this.data.cliente = "";
          });
      }
    };

    const buildDetailSection = () => {
      detailContainer.empty();
      const esDinero = this.data.deuda_tipo !== "producto";

      if (esDinero) {
        const montoRow = detailContainer.createDiv({ cls: "ordermanager-form-row" });
        new Setting(montoRow.createDiv()).setName(t("totalAmount")).addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.step = "0.01";
          text.setValue(String(this.data.monto_total || 0)).onChange((v) => {
            this.data.monto_total = parseFloat(v) || 0;
          });
        });
        new Setting(montoRow.createDiv()).setName(t("paidAmount")).addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.step = "0.01";
          text.setValue(String(this.data.monto_pagado || 0)).onChange((v) => {
            this.data.monto_pagado = parseFloat(v) || 0;
          });
        });

        new Setting(detailContainer)
          .setName(t("currency"))
          .addText((text) =>
            text
              .setValue(this.data.moneda || this.plugin.settings.defaultCurrency)
              .onChange((v) => (this.data.moneda = v))
          );

        const cuotasRow = detailContainer.createDiv({ cls: "ordermanager-form-row" });
        new Setting(cuotasRow.createDiv()).setName(t("installments")).addText((text) => {
          text.inputEl.type = "number";
          text.setValue(String(this.data.cuotas || 1)).onChange((v) => {
            this.data.cuotas = parseInt(v) || 1;
          });
        });
        new Setting(cuotasRow.createDiv()).setName(t("installmentsPaid")).addText((text) => {
          text.inputEl.type = "number";
          text.setValue(String(this.data.cuotas_pagadas || 0)).onChange((v) => {
            this.data.cuotas_pagadas = parseInt(v) || 0;
          });
        });

        new Setting(detailContainer).setName(t("interestRate")).addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.step = "0.01";
          text.setValue(String(this.data.tasa_interes || 0)).onChange((v) => {
            this.data.tasa_interes = parseFloat(v) || 0;
          });
        });
      } else {
        new Setting(detailContainer)
          .setName(t("product_label"))
          .addDropdown((dd: DropdownComponent) => {
            dd.addOption("", "—");
            for (const p of this.productos) {
              dd.addOption(p.nombre, p.nombre);
            }
            dd.setValue(this.data.producto || "");
            dd.onChange((v) => (this.data.producto = v));
          });

        new Setting(detailContainer).setName(t("quantity")).addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.step = "1";
          text.setValue(String(this.data.cantidad_producto || 0)).onChange((v) => {
            this.data.cantidad_producto = parseInt(v) || 0;
          });
        });
      }
    };

    const buildInventoryCheck = () => {
      inventoryCheckContainer.empty();
      if (this.data.deuda_tipo === "producto" && this.data.clase === "en_contra") {
        new Setting(inventoryCheckContainer)
          .setName(t("registerInInventory"))
          .setDesc(t("registerInventoryDesc"))
          .addToggle((toggle) => {
            toggle.setValue(this.data.registrar_en_inventario || false);
            toggle.onChange((v) => (this.data.registrar_en_inventario = v));
          });
      }
    };

    new Setting(form)
      .setName(t("debtType"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("a_favor", t("favorMe"));
        dd.addOption("en_contra", t("againstMe"));
        dd.setValue(this.data.clase || "a_favor");
        dd.onChange((v) => {
          this.data.clase = v as DeudaClase;
          this.data.cliente = "";
          this.data.proveedor = "";
          buildContactDropdown(contactContainer);
          buildInventoryCheck();
        });
      });

    new Setting(form)
      .setName(t("debtKind"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("dinero", t("money"));
        dd.addOption("producto", t("product_label"));
        dd.setValue(this.data.deuda_tipo || "dinero");
        dd.onChange((v) => {
          this.data.deuda_tipo = v as DeudaTipo;
          buildDetailSection();
          buildInventoryCheck();
        });
      });

    contactContainer = form.createDiv();
    buildContactDropdown(contactContainer);

    detailContainer = form.createDiv();
    buildDetailSection();

    inventoryCheckContainer = form.createDiv();
    buildInventoryCheck();

    const fechasRow = form.createDiv({ cls: "ordermanager-form-row" });
    new Setting(fechasRow.createDiv()).setName(t("startDate")).addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.data.fecha_inicio || today()).onChange((v) => (this.data.fecha_inicio = v));
    });
    new Setting(fechasRow.createDiv()).setName(t("dueDate")).addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.data.fecha_vencimiento || "").onChange(
        (v) => (this.data.fecha_vencimiento = v)
      );
    });

    new Setting(form).setName(t("description")).addTextArea((text) => {
      text.setValue(this.data.descripcion || "").onChange((v) => (this.data.descripcion = v));
    });

    new Setting(form)
      .setName(t("state"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("pendiente", t("pending"));
        dd.addOption("pagada", t("paid"));
        dd.addOption("vencida", t("overdue"));
        dd.setValue(this.data.estado || "pendiente");
        dd.onChange((v) => {
          this.data.estado = v as DeudaEstado;
        });
      });

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: t("cancel"), cls: "secondary" }).onclick = () =>
      this.close();
    if (this.existingFile) {
      actions.createEl("button", { text: t("delete"), cls: "danger" }).onclick = async () => {
        if (!confirm("¿Eliminar esta deuda?")) return;
        await this.plugin.dataManager.deleteFile(this.existingFile!);
        this.onSubmit();
        this.close();
      };
    }
    actions.createEl("button", { text: t("save"), cls: "primary" }).onclick = async () => {
      if (this.data.deuda_tipo === "producto") {
        if (!this.data.producto) {
          new Notice(t("productRequired"));
          return;
        }
        if (!(this.data.cantidad_producto && this.data.cantidad_producto > 0)) {
          new Notice(t("quantityRequired"));
          return;
        }
      } else {
        if (!(this.data.monto_total && this.data.monto_total > 0)) {
          new Notice(t("totalAmountRequired"));
          return;
        }
      }
      await this.plugin.dataManager.saveDeuda(this.data, this.existingFile || undefined);
      this.onSubmit();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
