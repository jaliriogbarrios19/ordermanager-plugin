import { App, Modal, Notice, Setting, DropdownComponent, TFile } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { TransaccionData, TipoOperacion, ModalidadPago, ProductoEnTransaccion, DeudaData } from "../types";
import { MONEDA_SOURCES } from "../types";
import { today, now } from "../utils/date";
import { t } from "../i18n";
import { ProductoModal } from "./producto-modal";
import {
  actualizarMontoDesdeProductos,
  buildPedidoSubtype,
  buildCategoriaDropdown,
  buildDeudaSection,
  buildProductosList,
  buildCreditoSection,
  buildClienteProveedor,
  buildFormFooter,
  type TransaccionFormState,
} from "./transaccion-form";
import { type SaveHandlerContext } from "./transaccion-handlers";

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
  private pedidoSubtype: "compra" | "venta" | null = null;
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
  private pedidoSubtypeContainer!: HTMLElement;

  constructor(
    app: App,
    plugin: OrderManagerPlugin,
    onSubmit: () => void,
    existing?: Partial<TransaccionData>,
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

  private buildFormState(categorias: import("../types").CategoriasData): TransaccionFormState {
    return {
      data: this.data,
      selectedProducts: this.selectedProducts,
      selectedDebtFile: this.selectedDebtFile,
      pedidoSubtype: this.pedidoSubtype,
      montoInput: this.montoInput,
      monedaDd: this.monedaDd,
      clienteDd: this.clienteDd,
      proveedorDd: this.proveedorDd,
      descripcionInput: this.descripcionInput,
      productosListEl: this.productosListEl,
      creditoContainer: this.creditoContainer,
      categoriaContainer: this.categoriaContainer,
      deudaContainer: this.deudaContainer,
      clienteContainer: this.clienteContainer,
      proveedorContainer: this.proveedorContainer,
      pedidoSubtypeContainer: this.pedidoSubtypeContainer,
      clientes: this.clientes,
      proveedores: this.proveedores,
      productos: this.productos,
      deudas: this.deudas,
      plugin: this.plugin,
      app: this.app,
      existingFile: this.existingFile,
    };
  }

  private buildSaveContext(): SaveHandlerContext {
    return {
      app: this.app,
      plugin: this.plugin,
      data: this.data,
      selectedProducts: this.selectedProducts,
      selectedDebtFile: this.selectedDebtFile,
      pedidoSubtype: this.pedidoSubtype,
      existingFile: this.existingFile,
      onSubmit: this.onSubmit,
      close: () => this.close(),
    };
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ordermanager-modal");

    new Setting(contentEl).setName(this.existingFile ? t("editTransaction") : t("newTransactionTitle")).setHeading();

    try {
    this.clientes = (await this.plugin.dataManager.getClientes()).map((c) => c.data);
    this.proveedores = (await this.plugin.dataManager.getProveedores()).map((p) => p.data);
    this.productos = (await this.plugin.dataManager.getProductos()).map((p) => p.data);
    this.deudas = await this.plugin.dataManager.getDeudas();
    const categorias = await this.plugin.dataManager.getCategorias();

    if (this.data.deuda_ref && !this.existingFile) {
      this.data.deuda_ref = "";
    }

    const form = contentEl.createDiv();

    new Setting(form)
      .setName(t("operationType"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("compra", t("purchase"));
        dd.addOption("venta", t("sale"));
        dd.addOption("pedido", t("order"));
        dd.setValue(this.data.tipo_operacion || "venta");
        dd.onChange((v) => {
          this.data.tipo_operacion = v as TipoOperacion;
          if (v === "pedido") {
            this.pedidoSubtype = this.pedidoSubtype || "venta";
            this.data.clase = this.pedidoSubtype === "compra" ? "egreso" : "ingreso";
          } else {
            this.pedidoSubtype = null;
            this.data.clase = v === "compra" ? "egreso" : "ingreso";
          }
          this.data.categoria = "";
          this.data.deuda_ref = "";
          this.selectedDebtFile = null;
          this.data.cliente = "";
          this.data.proveedor = "";
          const s = this.buildFormState(categorias);
          buildPedidoSubtype(s);
          buildCategoriaDropdown(s, this.categoriaContainer, categorias);
          buildDeudaSection(s);
          buildClienteProveedor(s);
        });
      });

    this.pedidoSubtypeContainer = form.createDiv();

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
          if (v === "credito") {
            if (!this.data.monto_total && this.data.monto) {
              this.data.monto_total = this.data.monto;
              this.data.monto = 0;
            }
            this.montoInput.value = String(this.data.monto_total || 0);
          } else {
            if (this.data.monto_total && !this.data.monto) {
              this.data.monto = this.data.monto_total;
            }
            this.montoInput.value = String(this.data.monto || 0);
          }
          const s = this.buildFormState(categorias);
          buildCreditoSection(s);
          buildDeudaSection(s);
        });
      });

    const productHeader = form.createDiv({ cls: "ordermanager-section-title" });
    productHeader.createSpan({ text: t("products") });

    const addRow = form.createDiv({ cls: "ordermanager-form-row" });
    let productoSelectDd!: DropdownComponent;
    let cantidadInput!: HTMLInputElement;
    let precioInput!: HTMLInputElement;
    let selectedProductName = "";

    const resetProductSelection = () => {
      selectedProductName = "";
      try { productoSelectDd?.setValue(""); } catch { /* */ }
      cantidadInput.value = "1";
      precioInput.value = "0";
    };

    new Setting(addRow.createDiv()).setName(t("product_label"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const p of this.productos) {
          dd.addOption(p.nombre, p.nombre);
        }
        dd.addOption("__new__", "➕ Nuevo producto...");
        productoSelectDd = dd;
      });

    new Setting(addRow.createDiv()).setName(t("quantity"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.step = "0.001";
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

    productoSelectDd.onChange((nombre) => { void (async () => {
      if (nombre === "__new__") {
        try { productoSelectDd.setValue(""); } catch { /* */ }
        new ProductoModal(this.app, this.plugin, () => { void (async () => {
          this.productos = (await this.plugin.dataManager.getProductos()).map((p) => p.data);
          const sel = productoSelectDd.selectEl;
          sel.empty();
          sel.createEl("option", { value: "", text: "—" });
          for (const p of this.productos) {
            sel.createEl("option", { value: p.nombre, text: p.nombre });
          }
          sel.createEl("option", { value: "__new__", text: "➕ Nuevo producto..." });
        })(); }).open();
        return;
      }
      selectedProductName = nombre || "";
      if (!nombre) return;
      const match = this.productos.find((p) => p.nombre === nombre);
      if (match) {
        const precio = this.data.tipo_operacion === "venta"
          ? match.precio_venta
          : match.precio_costo;
        precioInput.value = String(precio || 0);
      }
    })(); });

    const addProductBtn = addRow.createDiv().createEl("button", {
      text: `+ ${t("addProduct")}`,
    });
    addProductBtn.addClass("ordermanager-btn-accent");

    addProductBtn.onclick = () => {
      const nombre = selectedProductName;
      const cantidad = parseFloat(cantidadInput.value) || 0;
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
      actualizarMontoDesdeProductos(state);
      buildProductosList(state);
      resetProductSelection();
    };

    this.productosListEl = form.createDiv();
    this.productosListEl.setCssProps({marginBottom: "12px"});

    new Setting(form).setName(t("amount")).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.step = "0.01";
      const isCredito = this.data.modalidad_pago === "credito";
      text.setValue(String(isCredito ? (this.data.monto_total || 0) : (this.data.monto || 0)));
      text.onChange((v) => {
        if (this.data.modalidad_pago === "credito") {
          this.data.monto_total = parseFloat(v) || 0;
        } else {
          this.data.monto = parseFloat(v) || 0;
        }
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
    this.deudaContainer = form.createDiv();
    this.clienteContainer = form.createDiv();
    this.proveedorContainer = form.createDiv();
    this.creditoContainer = form.createDiv();

    const state = this.buildFormState(categorias);
    buildPedidoSubtype(state);
    buildCategoriaDropdown(state, this.categoriaContainer, categorias);
    buildDeudaSection(state);
    buildClienteProveedor(state);
    buildCreditoSection(state);
    buildProductosList(state);

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

    buildFormFooter(contentEl, form, state, this.buildSaveContext(), this.existingFile);

    } catch (err) {
      console.error("OrderManager: error en TransaccionModal.onOpen()", err);
      contentEl.createEl("p", {
        text: `Error al cargar el formulario: ${err instanceof Error ? err.message : String(err)}`,
        cls: "ordermanager-text-muted",
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
