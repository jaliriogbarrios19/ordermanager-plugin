import { App, Modal, Notice, Setting, DropdownComponent } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { DeudaData, DeudaClase, DeudaEstado } from "../types";
import { today, now } from "../utils/date";

export class DeudaModal extends Modal {
  plugin: OrderManagerPlugin;
  data: Partial<DeudaData>;
  existingFile: import("obsidian").TFile | null;
  onSubmit: () => void;
  clientes: Array<{ nombre: string }> = [];
  proveedores: Array<{ nombre: string }> = [];

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
          created: now(),
          updated: now(),
        };
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    contentEl.createEl("h3", {
      text: this.existingFile ? "Editar Deuda" : "Nueva Deuda",
    });

    this.clientes = (await this.plugin.dataManager.getClientes()).map((c) => c.data);
    this.proveedores = (await this.plugin.dataManager.getProveedores()).map((p) => p.data);

    const form = contentEl.createDiv();
    let contactSettingEl: HTMLElement;

    const buildContactDropdown = (container: HTMLElement) => {
      container.empty();
      if (this.data.clase === "a_favor") {
        new Setting(container)
          .setName("Cliente (deudor)")
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
          .setName("Proveedor (acreedor)")
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

    new Setting(form)
      .setName("Tipo de deuda")
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("a_favor", "A favor (me deben)");
        dd.addOption("en_contra", "En contra (debo)");
        dd.setValue(this.data.clase || "a_favor");
        dd.onChange((v) => {
          this.data.clase = v as DeudaClase;
          this.data.cliente = "";
          this.data.proveedor = "";
          buildContactDropdown(contactSettingEl);
        });
      });

    const montoRow = form.createDiv({ cls: "ordermanager-form-row" });
    new Setting(montoRow.createDiv()).setName("Monto total").addText((t) => {
      t.inputEl.type = "number";
      t.inputEl.step = "0.01";
      t.setValue(String(this.data.monto_total || 0)).onChange((v) => {
        this.data.monto_total = parseFloat(v) || 0;
      });
    });
    new Setting(montoRow.createDiv()).setName("Monto pagado").addText((t) => {
      t.inputEl.type = "number";
      t.inputEl.step = "0.01";
      t.setValue(String(this.data.monto_pagado || 0)).onChange((v) => {
        this.data.monto_pagado = parseFloat(v) || 0;
      });
    });

    new Setting(form)
      .setName("Moneda")
      .addText((t) =>
        t
          .setValue(this.data.moneda || this.plugin.settings.defaultCurrency)
          .onChange((v) => (this.data.moneda = v))
      );

    const fechasRow = form.createDiv({ cls: "ordermanager-form-row" });
    new Setting(fechasRow.createDiv()).setName("Fecha inicio").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(this.data.fecha_inicio || today()).onChange((v) => (this.data.fecha_inicio = v));
    });
    new Setting(fechasRow.createDiv()).setName("Fecha vencimiento").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(this.data.fecha_vencimiento || "").onChange(
        (v) => (this.data.fecha_vencimiento = v)
      );
    });

    contactSettingEl = form.createDiv();
    buildContactDropdown(contactSettingEl);

    new Setting(form).setName("Descripción").addTextArea((t) => {
      t.setValue(this.data.descripcion || "").onChange((v) => (this.data.descripcion = v));
    });

    new Setting(form)
      .setName("Estado")
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("pendiente", "Pendiente");
        dd.addOption("pagada", "Pagada");
        dd.addOption("vencida", "Vencida");
        dd.setValue(this.data.estado || "pendiente");
        dd.onChange((v) => {
          this.data.estado = v as DeudaEstado;
        });
      });

    const cuotasRow = form.createDiv({ cls: "ordermanager-form-row" });
    new Setting(cuotasRow.createDiv()).setName("Cuotas totales").addText((t) => {
      t.inputEl.type = "number";
      t.setValue(String(this.data.cuotas || 1)).onChange((v) => {
        this.data.cuotas = parseInt(v) || 1;
      });
    });
    new Setting(cuotasRow.createDiv()).setName("Cuotas pagadas").addText((t) => {
      t.inputEl.type = "number";
      t.setValue(String(this.data.cuotas_pagadas || 0)).onChange((v) => {
        this.data.cuotas_pagadas = parseInt(v) || 0;
      });
    });

    new Setting(form).setName("Tasa de interés (%)").addText((t) => {
      t.inputEl.type = "number";
      t.inputEl.step = "0.01";
      t.setValue(String(this.data.tasa_interes || 0)).onChange((v) => {
        this.data.tasa_interes = parseFloat(v) || 0;
      });
    });

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: "Cancelar", cls: "secondary" }).onclick = () =>
      this.close();
    if (this.existingFile) {
      actions.createEl("button", { text: "Eliminar", cls: "danger" }).onclick = async () => {
        if (!confirm("¿Eliminar esta deuda?")) return;
        await this.plugin.dataManager.deleteFile(this.existingFile!);
        this.onSubmit();
        this.close();
      };
    }
    actions.createEl("button", { text: "Guardar", cls: "primary" }).onclick = async () => {
      if (!(this.data.monto_total && this.data.monto_total > 0)) {
        new Notice("El monto total debe ser mayor a 0.");
        return;
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
