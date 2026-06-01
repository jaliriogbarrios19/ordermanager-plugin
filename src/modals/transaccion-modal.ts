import { App, Modal, Notice, Setting, DropdownComponent, TFile } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { TransaccionData, TransaccionClase, TipoOperacion, ModalidadPago, ProductoEnTransaccion, DeudaData } from "../types";
import { MONEDA_SOURCES } from "../types";
import { today, now } from "../utils/date";
import { convertir } from "../utils/exchange";
import { formatCurrency } from "../utils/currency";
import { t } from "../i18n";
import { TicketModal } from "./ticket-modal";

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
  productos: Array<{ nombre: string; precio_costo: number; precio_venta: number; stock: number }> = [];
  deudas: Array<{ file: TFile; data: DeudaData }> = [];

  private selectedDebtFile: TFile | null = null;
  private montoInput!: HTMLInputElement;
  private monedaDd!: DropdownComponent;
  private clienteDd!: DropdownComponent;
  private proveedorDd!: DropdownComponent;
  private descripcionInput!: HTMLTextAreaElement;
  private selectedProducts: ProductoEnTransaccion[] = [];
  private productosListEl!: HTMLElement;
  private creditoContainer!: HTMLElement;
  private categoriaContainer!: HTMLElement;
  private deudaContainer!: HTMLElement;
  private clienteContainer!: HTMLElement;
  private proveedorContainer!: HTMLElement;
  private productoTipoDd!: DropdownComponent;

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
          tipo_operacion: "venta",
          modalidad_pago: "contado",
          monto: 0,
          moneda: plugin.settings.defaultCurrency,
          fecha: today(),
          categoria: "",
          cliente: "",
          proveedor: "",
          producto: "",
          productos: [],
          descripcion: "",
          medio_pago: "",
          comprobante: "",
          estado: "confirmado",
          deuda_ref: "",
          monto_total: 0,
          tasa_interes: 0,
          cuotas: 1,
          cuotas_pagadas: 0,
          fecha_vencimiento: "",
          created: now(),
        };
    if (existing?.productos) {
      this.selectedProducts = [...existing.productos];
    }
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

    const actualizarMontoDesdeProductos = () => {
      const total = this.selectedProducts.reduce(
        (sum, p) => sum + p.cantidad * p.precio_unitario,
        0
      );
      if (total > 0) {
        this.data.monto = total;
        this.montoInput.value = String(total);
      }
    };

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
      this.deudaContainer.empty();
      if (this.data.modalidad_pago !== "contado") return;
      const cat = this.data.categoria || "";
      if (!esCategoriaDeuda(cat)) return;

      const claseFiltro = this.data.clase === "ingreso" ? "a_favor" : "en_contra";
      const deudasPendientes = this.deudas.filter(
        (d) =>
          d.data.clase === claseFiltro &&
          d.data.estado !== "pagada" &&
          (d.data.monto_total || 0) > (d.data.monto_pagado || 0)
      );

      if (deudasPendientes.length === 0) {
        this.deudaContainer.createEl("p", {
          text: t("noDebtsAvailable"),
          cls: "ordermanager-text-muted",
        });
        (this.deudaContainer.querySelector("p") as HTMLElement).style.cssText =
          "font-size:0.85em;color:var(--text-muted);margin:8px 0;";
        return;
      }

      new Setting(this.deudaContainer)
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
            try { this.monedaDd.setValue(debt.moneda); } catch { /* */ }

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

    const buildProductosList = () => {
      this.productosListEl.empty();
      if (this.selectedProducts.length === 0) {
        this.productosListEl.createEl("p", {
          text: t("noProducts"),
          cls: "ordermanager-text-muted",
        });
        return;
      }

      const table = this.productosListEl.createEl("table", { cls: "ordermanager-table" });
      const tbody = table.createEl("tbody");
      for (let i = 0; i < this.selectedProducts.length; i++) {
        const p = this.selectedProducts[i];
        const row = tbody.createEl("tr");
        row.createEl("td", { text: p.nombre });
        row.createEl("td", { text: `${p.cantidad} ud` });
        row.createEl("td", { text: formatCurrency(p.precio_unitario, this.data.moneda || "USD") });
        row.createEl("td", {
          text: formatCurrency(p.cantidad * p.precio_unitario, this.data.moneda || "USD"),
        });
        const delTd = row.createEl("td");
        const delBtn = delTd.createEl("button", { text: "×" });
        delBtn.style.cssText =
          "padding:2px 8px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;";
        delBtn.onclick = () => {
          this.selectedProducts.splice(i, 1);
          this.data.productos = [...this.selectedProducts];
          actualizarMontoDesdeProductos();
          buildProductosList();
        };
      }
    };

    const buildCreditoSection = () => {
      this.creditoContainer.empty();
      if (this.data.modalidad_pago !== "credito") return;

      const montoRow = this.creditoContainer.createDiv({ cls: "ordermanager-form-row" });
      new Setting(montoRow.createDiv()).setName(t("totalAmount")).addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.step = "0.01";
        text.setValue(String(this.data.monto_total || this.data.monto || 0));
        text.onChange((v) => {
          this.data.monto_total = parseFloat(v) || 0;
        });
      });
      new Setting(montoRow.createDiv()).setName(t("paidAmount")).addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.step = "0.01";
        text.setValue(String(this.data.monto || 0));
        text.onChange((v) => {
          this.data.monto = parseFloat(v) || 0;
        });
      });

      const cuotasRow = this.creditoContainer.createDiv({ cls: "ordermanager-form-row" });
      new Setting(cuotasRow.createDiv()).setName(t("installments")).addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.data.cuotas || 1));
        text.onChange((v) => {
          this.data.cuotas = parseInt(v) || 1;
        });
      });
      new Setting(cuotasRow.createDiv()).setName(t("installmentsPaid")).addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.data.cuotas_pagadas || 0));
        text.onChange((v) => {
          this.data.cuotas_pagadas = parseInt(v) || 0;
        });
      });

      new Setting(this.creditoContainer).setName(t("interestRate")).addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.step = "0.01";
        text.setValue(String(this.data.tasa_interes || 0));
        text.onChange((v) => {
          this.data.tasa_interes = parseFloat(v) || 0;
        });
      });

      new Setting(this.creditoContainer).setName(t("dueDate")).addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.data.fecha_vencimiento || "");
        text.onChange((v) => (this.data.fecha_vencimiento = v));
      });
    };

    const buildClienteProveedor = () => {
      this.clienteContainer.empty();
      this.proveedorContainer.empty();

      if (this.data.tipo_operacion === "venta") {
        new Setting(this.clienteContainer)
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
      }

      if (this.data.tipo_operacion === "compra") {
        new Setting(this.proveedorContainer)
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
      }
    };

    new Setting(form)
      .setName(t("operationType"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("compra", t("purchase"));
        dd.addOption("venta", t("sale"));
        dd.setValue(this.data.tipo_operacion || "venta");
        dd.onChange((v) => {
          this.data.tipo_operacion = v as TipoOperacion;
          this.data.clase = v === "compra" ? "egreso" : "ingreso";
          this.data.categoria = "";
          this.data.deuda_ref = "";
          this.selectedDebtFile = null;
          this.data.cliente = "";
          this.data.proveedor = "";
          buildCategoriaDropdown(this.categoriaContainer);
          buildDeudaSection();
          buildClienteProveedor();
        });
      });

    new Setting(form)
      .setName(t("paymentModality"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("contado", t("cash"));
        dd.addOption("credito", t("credit"));
        dd.setValue(this.data.modalidad_pago || "contado");
        dd.onChange((v) => {
          this.data.modalidad_pago = v as ModalidadPago;
          this.data.deuda_ref = "";
          this.selectedDebtFile = null;
          buildCreditoSection();
          buildDeudaSection();
        });
      });

    const productHeader = form.createDiv({ cls: "ordermanager-section-title" });
    productHeader.style.cssText = "margin-top:16px;font-weight:600;";
    productHeader.createSpan({ text: t("products") });

    const addRow = form.createDiv({ cls: "ordermanager-form-row" });
    let productoSelectDd!: DropdownComponent;
    let cantidadInput!: HTMLInputElement;
    let precioInput!: HTMLInputElement;

    new Setting(addRow.createDiv()).setName(t("product_label"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const p of this.productos) {
          dd.addOption(p.nombre, p.nombre);
        }
        productoSelectDd = dd;
      });

    new Setting(addRow.createDiv()).setName(t("quantity"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.step = "1";
        text.setValue("1");
        cantidadInput = text.inputEl;
      });

    new Setting(addRow.createDiv()).setName(t("unitPrice"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.step = "0.01";
        text.setValue("0");
        precioInput = text.inputEl;
      });

    productoSelectDd.onChange((nombre) => {
      if (!nombre) return;
      const match = this.productos.find((p) => p.nombre === nombre);
      if (match) {
        const precio = this.data.tipo_operacion === "venta"
          ? match.precio_venta
          : match.precio_costo;
        precioInput.value = String(precio || 0);
      }
    });

    const addProductBtn = addRow.createDiv().createEl("button", {
      text: `+ ${t("addProduct")}`,
    });
    addProductBtn.style.cssText =
      "padding:6px 12px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-weight:500;";

    addProductBtn.onclick = () => {
      const nombre = (productoSelectDd as any).selectEl?.value || "";
      const cantidad = parseInt(cantidadInput.value) || 0;
      const precio = parseFloat(precioInput.value) || 0;
      if (!nombre || cantidad <= 0 || precio <= 0) {
        new Notice("Completá producto, cantidad y precio.");
        return;
      }

      const existing = this.selectedProducts.find(
        (p) => p.nombre.toLowerCase() === nombre.toLowerCase()
      );
      if (existing) {
        existing.cantidad += cantidad;
      } else {
        this.selectedProducts.push({ nombre, cantidad, precio_unitario: precio });
      }

      this.data.productos = [...this.selectedProducts];
      actualizarMontoDesdeProductos();
      buildProductosList();

      try { productoSelectDd.setValue(""); } catch { /* */ }
      cantidadInput.value = "1";
      precioInput.value = "0";
    };

    this.productosListEl = form.createDiv();
    this.productosListEl.style.cssText = "margin-bottom:12px;";
    buildProductosList();

    const montoSetting = new Setting(form).setName(t("amount")).addText((text) => {
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

    this.categoriaContainer = form.createDiv();
    buildCategoriaDropdown(this.categoriaContainer);

    this.deudaContainer = form.createDiv();
    buildDeudaSection();

    this.clienteContainer = form.createDiv();
    this.proveedorContainer = form.createDiv();
    buildClienteProveedor();

    this.creditoContainer = form.createDiv();
    buildCreditoSection();

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
    const compPreview = form.createDiv();
    compPreview.style.cssText = "margin:4px 0 12px 0;";

    const renderPreview = () => {
      compPreview.empty();
      if (!this.data.comprobante) return;
      const file = this.app.vault.getAbstractFileByPath(this.data.comprobante);
      if (!(file instanceof TFile)) return;
      const resourceUrl = this.app.vault.getResourcePath(file);
      const ext = this.data.comprobante.split(".").pop()?.toLowerCase() || "";

      if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) {
        const img = compPreview.createEl("img");
        img.src = resourceUrl;
        img.style.cssText =
          "max-width:100%;max-height:300px;margin-top:8px;border-radius:4px;border:1px solid var(--background-modifier-border);cursor:pointer;";
        img.setAttr("title", "Click para abrir en tamaño completo");
        img.onclick = () => {
          this.app.workspace.openLinkText(this.data.comprobante!, "", false);
        };
      } else if (ext === "pdf") {
        const pdfBtn = compPreview.createEl("button", { text: "Ver PDF" });
        pdfBtn.style.cssText =
          "margin-top:8px;padding:6px 14px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:0.85em;font-weight:500;";
        pdfBtn.onclick = () => {
          this.app.workspace.openLinkText(this.data.comprobante!, "", false);
        };
      }
    };

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
      renderPreview();
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
    actions.createEl("button", { text: t("generateTicket") }).onclick = async () => {
      if (!this.data.monto || !this.data.fecha) {
        new Notice("Completá los datos de la transacción antes de generar el ticket.");
        return;
      }
      const clientes = await this.plugin.dataManager.getClientes();
      const cliente = clientes.find((c) => c.data.nombre === this.data.cliente);
      new TicketModal(this.app, this.plugin, this.data as TransaccionData, cliente?.data).open();
    };
    actions.createEl("button", { text: t("save"), cls: "primary" }).onclick = async () => {
      if (!(this.data.monto && this.data.monto > 0) && this.data.modalidad_pago !== "credito") {
        new Notice(t("amountRequired"));
        return;
      }

      this.data.productos = [...this.selectedProducts];

      const ref = this.plugin.settings.tasaReferencia || "USD";
      const rates = this.plugin.settings.tasasCambio || { USD: 1 };

      if (this.data.modalidad_pago === "credito") {
        const montoTotal = this.data.monto_total || this.data.monto || 0;
        const montoPagado = this.data.monto || 0;

        if (montoTotal <= 0) {
          new Notice(t("totalAmountRequired"));
          return;
        }

        const deudaClase = this.data.clase === "ingreso" ? "a_favor" : "en_contra";
        let deudaFile: TFile | null = null;

        const deudaData: Partial<DeudaData> = {
          tipo: "deuda",
          clase: deudaClase,
          deuda_tipo: "dinero",
          monto_total: montoTotal,
          monto_pagado: montoPagado,
          moneda: this.data.moneda || this.plugin.settings.defaultCurrency,
          fecha_inicio: this.data.fecha || today(),
          fecha_vencimiento: this.data.fecha_vencimiento || "",
          cliente: this.data.cliente || "",
          proveedor: this.data.proveedor || "",
          descripcion: this.data.descripcion || "",
          estado: montoPagado >= montoTotal ? "pagada" : "pendiente",
          cuotas: this.data.cuotas || 1,
          cuotas_pagadas: this.data.cuotas_pagadas || 0,
          tasa_interes: this.data.tasa_interes || 0,
        };

        deudaFile = await this.plugin.dataManager.saveDeuda(deudaData);

        if (this.selectedProducts.length > 0) {
          await this.plugin.dataManager.actualizarInventario({
            clase: this.data.clase,
            productos: this.selectedProducts,
          });
        }

        if (montoPagado > 0) {
          this.data.monto = montoPagado;
          this.data.monto_referencia = convertir(montoPagado, this.data.moneda || "USD", rates, ref);
          this.data.deuda_ref = deudaFile.path;
          this.data.monto_total = montoTotal;

          const saveData: Partial<TransaccionData> = {
            ...this.data,
            productos: [],
          };

          await this.plugin.dataManager.saveTransaccion(
            saveData,
            this.existingFile || undefined
          );
        }
      } else {
        if (this.selectedProducts.length > 0) {
          this.data.monto = this.selectedProducts.reduce(
            (sum, p) => sum + p.cantidad * p.precio_unitario,
            0
          );
        }

        this.data.monto_referencia = convertir(
          this.data.monto || 0,
          this.data.moneda || "USD",
          rates,
          ref
        );

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
      }

      this.onSubmit();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}