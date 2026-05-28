import { App, Modal, Setting } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { ProductoData, InsumoReceta } from "../types";
import { formatCurrency } from "../utils/currency";

export class RecetaModal extends Modal {
  plugin: OrderManagerPlugin;
  producto: ProductoData;
  productoFile: import("obsidian").TFile;
  receta: InsumoReceta[];
  margen: number;
  porcion: number;
  onSubmit: () => void;
  private subtotalCells: HTMLElement[] = [];

  constructor(
    app: App,
    plugin: OrderManagerPlugin,
    producto: ProductoData,
    file: import("obsidian").TFile,
    onSubmit: () => void
  ) {
    super(app);
    this.plugin = plugin;
    this.producto = producto;
    this.productoFile = file;
    this.receta = [...(producto.receta || [])];
    this.margen = producto.margen_ganancia ?? 30;
    this.porcion = producto.porcion ?? 1;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    contentEl.createEl("h3", { text: `Estructura de Costo \u2014 ${this.producto.nombre}` });

    const calcRow = contentEl.createDiv();
    calcRow.style.cssText = "display:flex;gap:16px;margin-bottom:12px;align-items:center;flex-wrap:wrap;";

    const updateSubtotals = () => {
      this.receta.forEach((item, i) => {
        if (this.subtotalCells[i]) {
          this.subtotalCells[i].setText(formatCurrency((item.cantidad || 0) * (item.costo_unitario || 0), this.producto.moneda));
        }
      });
    };

    const updateDisplay = () => {
      calcRow.empty();
      const costoTotal = this.receta.reduce((s, i) => s + (i.cantidad || 0) * (i.costo_unitario || 0), 0);
      const costoSinMargen = this.receta.filter((i) => !i.aplicar_margen).reduce((s, i) => s + (i.cantidad || 0) * (i.costo_unitario || 0), 0);
      const costoConMargen = costoTotal - costoSinMargen;
      const costoUnitario = costoTotal / (this.porcion || 1);
      const ventaUnitario = (costoConMargen * (1 + (this.margen || 0) / 100) + costoSinMargen) / (this.porcion || 1);

      calcRow.createEl("span", { text: `Costo total: ${formatCurrency(costoTotal, this.producto.moneda)}` }).style.cssText = "font-weight:600;";
      calcRow.createEl("span", { text: `Costo/ud: ${formatCurrency(costoUnitario, this.producto.moneda)}` }).style.cssText = "font-weight:600;";
      calcRow.createEl("span", { text: `Precio venta/ud: ${formatCurrency(ventaUnitario, this.producto.moneda)}` }).style.cssText = "font-weight:700;color:var(--color-green);";
      updateSubtotals();
    };

    const margenRow = contentEl.createDiv();
    margenRow.style.cssText = "display:flex;gap:8px;margin-bottom:12px;align-items:center;";
    new Setting(margenRow.createDiv()).setName("Margen (%)").addText((t) => {
      t.inputEl.type = "number";
      t.setValue(String(this.margen));
      t.onChange((v) => { this.margen = parseFloat(v) || 0; updateDisplay(); });
    });
    new Setting(margenRow.createDiv()).setName("Porciones").addText((t) => {
      t.inputEl.type = "number";
      t.setValue(String(this.porcion));
      t.onChange((v) => { this.porcion = Math.max(1, parseInt(v) || 1); updateDisplay(); });
    });

    updateDisplay();

    contentEl.createEl("h4", { text: "Insumos" });

    const tableWrapper = contentEl.createDiv();

    const renderTable = () => {
      tableWrapper.empty();
      this.subtotalCells = [];
      const table = tableWrapper.createEl("table", { cls: "ordermanager-table" });
      const thead = table.createEl("thead");
      const hr = thead.createEl("tr");
      for (const h of ["Insumo", "Cantidad", "Unidad", "Costo/ud", "Subtotal", "Margen", ""]) hr.createEl("th", { text: h });

      const tbody = table.createEl("tbody");
      this.receta.forEach((item, idx) => {
        const row = tbody.createEl("tr");
        const nameTd = row.createEl("td");
        const nameInput = nameTd.createEl("input", { type: "text" });
        nameInput.style.cssText = "width:100px;padding:2px 4px;border:1px solid var(--background-modifier-border);border-radius:3px;font-size:0.85em;";
        nameInput.value = item.nombre;
        nameInput.oninput = () => { item.nombre = nameInput.value; };

        const cantTd = row.createEl("td");
        const cantInput = cantTd.createEl("input", { type: "number" });
        cantInput.style.cssText = "width:70px;padding:2px 4px;border:1px solid var(--background-modifier-border);border-radius:3px;font-size:0.85em;";
        cantInput.step = "0.01";
        cantInput.value = String(item.cantidad);
        cantInput.oninput = () => { item.cantidad = parseFloat(cantInput.value) || 0; updateDisplay(); };

        const unidadTd = row.createEl("td");
        const unidadInput = unidadTd.createEl("input", { type: "text" });
        unidadInput.style.cssText = "width:50px;padding:2px 4px;border:1px solid var(--background-modifier-border);border-radius:3px;font-size:0.85em;";
        unidadInput.value = item.unidad;
        unidadInput.oninput = () => { item.unidad = unidadInput.value; };

        const costoTd = row.createEl("td");
        const costoInput = costoTd.createEl("input", { type: "number" });
        costoInput.style.cssText = "width:80px;padding:2px 4px;border:1px solid var(--background-modifier-border);border-radius:3px;font-size:0.85em;";
        costoInput.step = "0.0001";
        costoInput.value = String(item.costo_unitario);
        costoInput.oninput = () => { item.costo_unitario = parseFloat(costoInput.value) || 0; updateDisplay(); };

        const subtotalTd = row.createEl("td");
        this.subtotalCells.push(subtotalTd);

        const margenTd = row.createEl("td");
        const margenCheck = margenTd.createEl("input", { type: "checkbox" }) as HTMLInputElement;
        margenCheck.checked = item.aplicar_margen !== false;
        margenCheck.style.cssText = "cursor:pointer;";
        margenCheck.onchange = () => { item.aplicar_margen = margenCheck.checked; updateDisplay(); };

        const delTd = row.createEl("td");
        const delBtn = delTd.createEl("button", { text: "\u00d7" });
        delBtn.style.cssText = "padding:2px 8px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;";
        delBtn.onclick = () => { this.receta.splice(idx, 1); renderTable(); updateDisplay(); };
      });
      updateSubtotals();
    };
    renderTable();

    const addRow = contentEl.createDiv();
    addRow.style.cssText = "margin-top:8px;";
    const addBtn = addRow.createEl("button", { text: "+ Agregar insumo" });
    addBtn.style.cssText = "padding:6px 14px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;";
    addBtn.onclick = () => {
      this.receta.push({ nombre: "", cantidad: 0, unidad: "g", costo_unitario: 0, aplicar_margen: true });
      renderTable();
      updateDisplay();
    };

    const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: "Cancelar", cls: "secondary" }).onclick = () => this.close();
    actions.createEl("button", { text: "Guardar", cls: "primary" }).onclick = async () => {
      const costoTotal = this.receta.reduce((s, i) => s + (i.cantidad || 0) * (i.costo_unitario || 0), 0);
      const costoSinMargen = this.receta.filter((i) => !i.aplicar_margen).reduce((s, i) => s + (i.cantidad || 0) * (i.costo_unitario || 0), 0);
      const costoConMargen = costoTotal - costoSinMargen;
      this.producto.precio_costo = costoTotal / (this.porcion || 1);
      this.producto.precio_venta = (costoConMargen * (1 + (this.margen || 0) / 100) + costoSinMargen) / (this.porcion || 1);
      this.producto.margen_ganancia = this.margen;
      this.producto.porcion = this.porcion;
      this.producto.receta = this.receta;
      await this.plugin.dataManager.saveProducto(this.producto, this.productoFile);
      this.onSubmit();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
