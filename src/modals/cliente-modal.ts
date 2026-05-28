import { App, Modal, Notice, Setting } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { ClienteData } from "../types";
import { now } from "../utils/date";

export class ClienteModal extends Modal {
  plugin: OrderManagerPlugin;
  data: Partial<ClienteData>;
  existingFile: import("obsidian").TFile | null;
  onSubmit: () => void;

  constructor(
    app: App,
    plugin: OrderManagerPlugin,
    onSubmit: () => void,
    existing?: ClienteData,
    file?: import("obsidian").TFile
  ) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.existingFile = file || null;
    this.data = existing
      ? { ...existing }
      : {
          tipo: "cliente",
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
      text: this.existingFile ? "Editar Cliente" : "Nuevo Cliente",
    });

    const form = contentEl.createDiv();

    this.addField(form, "Nombre", "nombre", "text");
    this.addField(form, "RUC / CI", "ruc", "text");
    this.addField(form, "Email", "email", "text");
    this.addField(form, "Teléfono", "telefono", "text");
    this.addField(form, "Dirección", "direccion", "text");

    new Setting(form)
      .setName("Categoría")
      .addDropdown((dd) => {
        dd.addOption("", "—");
        for (const cat of this.plugin.settings.categoriasCliente) {
          dd.addOption(cat, cat);
        }
        dd.setValue(this.data.categoria || "");
        dd.onChange((v) => {
          this.data.categoria = v;
        });
      });

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: "Cancelar", cls: "secondary" }).onclick = () => this.close();
    if (this.existingFile) {
      actions.createEl("button", { text: "Eliminar", cls: "danger" }).onclick = async () => {
        if (!confirm("¿Eliminar este cliente?")) return;
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
      await this.plugin.dataManager.saveCliente(this.data, this.existingFile || undefined);
      this.onSubmit();
      this.close();
    };
  }

  private addField(
    container: HTMLElement,
    label: string,
    key: string,
    type: string
  ): void {
    new Setting(container).setName(label).addText((text) => {
      if (type === "number") {
        text.inputEl.type = "number";
      }
      text.setValue(String((this.data as Record<string, unknown>)[key] || "")).onChange(
        (value) => {
          (this.data as Record<string, unknown>)[key] = type === "number" ? Number(value) : value;
        }
      );
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
