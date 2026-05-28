import { App, Modal, Notice, Setting, DropdownComponent } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { ProveedorData } from "../types";
import { now } from "../utils/date";

export class ProveedorModal extends Modal {
  plugin: OrderManagerPlugin;
  data: Partial<ProveedorData>;
  existingFile: import("obsidian").TFile | null;
  onSubmit: () => void;

  constructor(
    app: App,
    plugin: OrderManagerPlugin,
    onSubmit: () => void,
    existing?: ProveedorData,
    file?: import("obsidian").TFile
  ) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.existingFile = file || null;
    this.data = existing
      ? { ...existing }
      : {
          tipo: "proveedor",
          nombre: "",
          ruc: "",
          email: "",
          telefono: "",
          direccion: "",
          categoria: "",
          created: now(),
          updated: now(),
        };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    contentEl.createEl("h3", {
      text: this.existingFile ? "Editar Proveedor" : "Nuevo Proveedor",
    });

    const form = contentEl.createDiv();

    new Setting(form).setName("Nombre").addText((t) =>
      t.setValue(this.data.nombre || "").onChange((v) => (this.data.nombre = v))
    );
    new Setting(form).setName("RUC / CI").addText((t) =>
      t.setValue(this.data.ruc || "").onChange((v) => (this.data.ruc = v))
    );
    new Setting(form).setName("Email").addText((t) =>
      t.setValue(this.data.email || "").onChange((v) => (this.data.email = v))
    );
    new Setting(form).setName("Teléfono").addText((t) =>
      t.setValue(this.data.telefono || "").onChange((v) => (this.data.telefono = v))
    );
    new Setting(form).setName("Dirección").addText((t) =>
      t.setValue(this.data.direccion || "").onChange((v) => (this.data.direccion = v))
    );
    new Setting(form).setName("Categoría").addDropdown((dd: DropdownComponent) => {
      dd.addOption("", "—");
      for (const cat of this.plugin.settings.categoriasProveedor) {
        dd.addOption(cat, cat);
      }
      dd.setValue(this.data.categoria || "");
      dd.onChange((v) => (this.data.categoria = v));
    });

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: "Cancelar", cls: "secondary" }).onclick = () => this.close();
    if (this.existingFile) {
      actions.createEl("button", { text: "Eliminar", cls: "danger" }).onclick = async () => {
        if (!confirm("¿Eliminar este proveedor?")) return;
        await this.plugin.dataManager.deleteFile(this.existingFile!);
        this.onSubmit();
        this.close();
      };
    }
    actions.createEl("button", { text: "Guardar", cls: "primary" }).onclick = async () => {
      if (!(this.data.nombre || "").trim()) {
        new Notice("El nombre es obligatorio.");
        return;
      }
      await this.plugin.dataManager.saveProveedor(this.data, this.existingFile || undefined);
      this.onSubmit();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
