import { App, Modal, Notice, Setting, DropdownComponent } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { TransaccionData, TransaccionClase } from "../types";
import { MONEDA_SOURCES } from "../types";
import { today, now } from "../utils/date";
import { convertir } from "../utils/exchange";

export class TransaccionModal extends Modal {
  plugin: OrderManagerPlugin;
  data: Partial<TransaccionData>;
  existingFile: import("obsidian").TFile | null;
  onSubmit: () => void;
  clientes: Array<{ nombre: string }> = [];
  proveedores: Array<{ nombre: string }> = [];
  productos: Array<{ nombre: string }> = [];

  constructor(
    app: App,
    plugin: OrderManagerPlugin,
    onSubmit: () => void,
    existing?: TransaccionData,
    file?: import("obsidian").TFile
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
          created: now(),
        };
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    contentEl.createEl("h3", {
      text: this.existingFile ? "Editar Transacción" : "Nueva Transacción",
    });

    this.clientes = (await this.plugin.dataManager.getClientes()).map((c) => c.data);
    this.proveedores = (await this.plugin.dataManager.getProveedores()).map((p) => p.data);
    this.productos = (await this.plugin.dataManager.getProductos()).map((p) => p.data);

    const form = contentEl.createDiv();
    let categoriaSettingEl: HTMLElement;

    const buildCategoriaDropdown = (container: HTMLElement) => {
      container.empty();
      new Setting(container)
        .setName("Categoría")
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
          dd.onChange((v) => (this.data.categoria = v));
        });
    };

    new Setting(form)
      .setName("Tipo")
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("ingreso", "Ingreso");
        dd.addOption("egreso", "Egreso");
        dd.setValue(this.data.clase || "ingreso");
        dd.onChange((v) => {
          this.data.clase = v as TransaccionClase;
          this.data.categoria = "";
          buildCategoriaDropdown(categoriaSettingEl);
        });
      });

    new Setting(form).setName("Monto").addText((t) => {
      t.inputEl.type = "number";
      t.inputEl.step = "0.01";
      t.setValue(String(this.data.monto || 0)).onChange((v) => {
        this.data.monto = parseFloat(v) || 0;
      });
    });

    new Setting(form)
      .setName("Moneda")
      .addDropdown((dd: DropdownComponent) => {
        const monedas = Object.keys(this.plugin.settings.tasasCambio || {}).filter((k) => !k.startsWith("_"));
        if (monedas.length === 0) monedas.push("USD");
        for (const m of monedas) {
          const source = MONEDA_SOURCES.find((s) => s.code === m);
          dd.addOption(m, source?.label || m);
        }
        dd.setValue(this.data.moneda || this.plugin.settings.defaultCurrency);
        dd.onChange((v) => (this.data.moneda = v));
      });

    new Setting(form).setName("Fecha").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(this.data.fecha || today()).onChange((v) => (this.data.fecha = v));
    });

    categoriaSettingEl = form.createDiv();
    buildCategoriaDropdown(categoriaSettingEl);

    new Setting(form)
      .setName("Cliente")
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const c of this.clientes) {
          dd.addOption(c.nombre, c.nombre);
        }
        dd.setValue(this.data.cliente || "");
        dd.onChange((v) => (this.data.cliente = v));
      });

    new Setting(form)
      .setName("Proveedor")
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const p of this.proveedores) {
          dd.addOption(p.nombre, p.nombre);
        }
        dd.setValue(this.data.proveedor || "");
        dd.onChange((v) => (this.data.proveedor = v));
      });

    new Setting(form)
      .setName("Producto")
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const p of this.productos) {
          dd.addOption(p.nombre, p.nombre);
        }
        dd.setValue(this.data.producto || "");
        dd.onChange((v) => (this.data.producto = v));
      });

    new Setting(form).setName("Descripción").addTextArea((t) => {
      t.setValue(this.data.descripcion || "").onChange((v) => (this.data.descripcion = v));
    });

    new Setting(form)
      .setName("Medio de pago")
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const m of this.plugin.settings.mediosPago) {
          dd.addOption(m, m);
        }
        dd.setValue(this.data.medio_pago || "");
        dd.onChange((v) => (this.data.medio_pago = v));
      });

    const compSetting = new Setting(form).setName("Comprobante").addText((t) =>
      t.setValue(this.data.comprobante || "").onChange((v) => (this.data.comprobante = v))
    );
    compSetting.addButton((btn) => {
      btn.setIcon("file").setTooltip("Adjuntar archivo");
      btn.onClick(() => {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip";
        fileInput.onchange = () => {
          const file = fileInput.files?.[0];
          if (file) {
            this.data.comprobante = file.name;
            (compSetting.components[0] as any).inputEl.value = file.name;
          }
        };
        fileInput.click();
      });
    });

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
      .addText((t) => {
        t.inputEl.type = "date";
        t.setValue(this.data.recurrente_hasta || "");
        t.onChange((v) => (this.data.recurrente_hasta = v));
      });

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: "Cancelar", cls: "secondary" }).onclick = () =>
      this.close();
    if (this.existingFile) {
      actions.createEl("button", { text: "Eliminar", cls: "danger" }).onclick = async () => {
        if (!confirm("¿Eliminar esta transacción?")) return;
        await this.plugin.dataManager.deleteFile(this.existingFile!);
        this.onSubmit();
        this.close();
      };
    }
    actions.createEl("button", { text: "Guardar", cls: "primary" }).onclick = async () => {
      if (!(this.data.monto && this.data.monto > 0)) {
        new Notice("El monto debe ser mayor a 0.");
        return;
      }
      const ref = this.plugin.settings.tasaReferencia || "USD";
      const rates = this.plugin.settings.tasasCambio || { USD: 1 };
      this.data.monto_referencia = convertir(this.data.monto || 0, this.data.moneda || "USD", rates, ref);
      await this.plugin.dataManager.saveTransaccion(
        this.data,
        this.existingFile || undefined
      );
      this.onSubmit();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
