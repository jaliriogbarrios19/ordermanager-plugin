import { App, Modal, Notice, Setting, DropdownComponent } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { ProductoData } from "../types";
import { now } from "../utils/date";

export class ProductoModal extends Modal {
  plugin: OrderManagerPlugin;
  data: Partial<ProductoData>;
  existingFile: import("obsidian").TFile | null;
  onSubmit: () => void;
  proveedores: Array<{ nombre: string }> = [];

  constructor(
    app: App,
    plugin: OrderManagerPlugin,
    onSubmit: () => void,
    existing?: ProductoData,
    file?: import("obsidian").TFile
  ) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.existingFile = file || null;
    this.data = existing
      ? { ...existing }
      : {
          tipo: "producto",
          nombre: "",
          descripcion: "",
          precio_costo: 0,
          precio_venta: 0,
          stock: 0,
          categoria: "",
          proveedor: "",
          moneda: plugin.settings.defaultCurrency,
          created: now(),
          updated: now(),
        };
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    contentEl.createEl("h3", {
      text: this.existingFile ? "Editar Producto" : "Nuevo Producto",
    });

    this.proveedores = (await this.plugin.dataManager.getProveedores()).map((p) => p.data);

    const form = contentEl.createDiv();

    new Setting(form).setName("Nombre").addText((t) =>
      t.setValue(this.data.nombre || "").onChange((v) => (this.data.nombre = v))
    );

    new Setting(form).setName("Descripción").addTextArea((t) => {
      t.setValue(this.data.descripcion || "").onChange((v) => (this.data.descripcion = v));
    });

    const preciosRow = form.createDiv({ cls: "ordermanager-form-row" });
    new Setting(preciosRow.createDiv())
      .setName("Precio de costo")
      .setDesc("0 = producción propia")
      .addText((t) => {
        t.inputEl.type = "number";
        t.inputEl.step = "0.01";
        t.setValue(String(this.data.precio_costo ?? 0)).onChange((v) => {
          this.data.precio_costo = parseFloat(v) || 0;
        });
      });
    new Setting(preciosRow.createDiv()).setName("Precio de venta").addText((t) => {
      t.inputEl.type = "number";
      t.inputEl.step = "0.01";
      t.setValue(String(this.data.precio_venta || 0)).onChange((v) => {
        this.data.precio_venta = parseFloat(v) || 0;
      });
    });

    const metaRow = form.createDiv({ cls: "ordermanager-form-row" });
    new Setting(metaRow.createDiv()).setName("Stock").addText((t) => {
      t.inputEl.type = "number";
      t.setValue(String(this.data.stock ?? 0)).onChange((v) => {
        this.data.stock = parseInt(v) || 0;
      });
    });
    new Setting(metaRow.createDiv())
      .setName("Alerta stock")
      .setDesc("0 = sin alerta")
      .addText((t) => {
        t.inputEl.type = "number";
        t.setValue(String(this.data.stock_minimo ?? 0)).onChange((v) => {
          this.data.stock_minimo = parseInt(v) || 0;
        });
      });

    const metaRow2 = form.createDiv({ cls: "ordermanager-form-row" });
    new Setting(metaRow2.createDiv())
      .setName("Moneda")
      .addText((t) =>
        t
          .setValue(this.data.moneda || this.plugin.settings.defaultCurrency)
          .onChange((v) => (this.data.moneda = v))
      );

    new Setting(form)
      .setName("Categoría")
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const cat of this.plugin.settings.categoriasProducto) {
          dd.addOption(cat, cat);
        }
        dd.setValue(this.data.categoria || "");
        dd.onChange((v) => (this.data.categoria = v));
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

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: "Cancelar", cls: "secondary" }).onclick = () =>
      this.close();
    if (this.existingFile) {
      actions.createEl("button", { text: "Eliminar", cls: "danger" }).onclick = async () => {
        if (!confirm("¿Eliminar este producto?")) return;
        await this.plugin.dataManager.deleteFile(this.existingFile!);
        this.onSubmit();
        this.close();
      };
    }
    actions.createEl("button", { text: "Guardar", cls: "primary" }).onclick = async () => {
      if (!(this.data.nombre || "").trim()) {
        new Notice("El nombre del producto es obligatorio.");
        return;
      }
      await this.plugin.dataManager.saveProducto(this.data, this.existingFile || undefined);
      this.onSubmit();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
