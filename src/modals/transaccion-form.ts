import { App, TFile, Setting, DropdownComponent } from "obsidian";
import type { TransaccionData, DeudaData, ProductoEnTransaccion, CategoriasData } from "../types";
import { formatCurrency } from "../utils/currency";
import { t } from "../i18n";
import { ClienteModal } from "./cliente-modal";
import { ProveedorModal } from "./proveedor-modal";
import type OrderManagerPlugin from "../main";
import type { SaveHandlerContext } from "./transaccion-handlers";
import { handleDeliver, handleGenerateTicket, handleSave } from "./transaccion-handlers";
import { confirmAction } from "../utils/confirm";

import { renderComprobante, type ComprobanteState } from "./comprobante";

export { renderComprobante, type ComprobanteState };

function esCategoriaDeuda(cat: string): boolean {
  return /deuda/i.test(cat);
}

export interface TransaccionFormState {
  data: Partial<TransaccionData>;
  selectedProducts: ProductoEnTransaccion[];
  selectedDebtFile: TFile | null;
  pedidoSubtype: "compra" | "venta" | null;
  montoInput: HTMLInputElement;
  monedaDd: DropdownComponent;
  clienteDd: DropdownComponent;
  proveedorDd: DropdownComponent;
  descripcionInput: HTMLTextAreaElement;
  productosListEl: HTMLElement;
  creditoContainer: HTMLElement;
  categoriaContainer: HTMLElement;
  deudaContainer: HTMLElement;
  clienteContainer: HTMLElement;
  proveedorContainer: HTMLElement;
  pedidoSubtypeContainer: HTMLElement;
  clientes: Array<{ nombre: string }>;
  proveedores: Array<{ nombre: string }>;
  productos: Array<{ nombre: string; precio_costo: number; precio_venta: number; stock: number }>;
  deudas: Array<{ file: TFile; data: DeudaData }>;
  plugin: OrderManagerPlugin;
  app: App;
  existingFile: TFile | null;
}

export function actualizarMontoDesdeProductos(state: TransaccionFormState): void {
  const total = state.selectedProducts.reduce(
    (sum, p) => sum + p.cantidad * p.precio_unitario,
    0
  );
  if (total > 0) {
    if (state.data.modalidad_pago === "credito") {
      state.data.monto_total = total;
    } else {
      state.data.monto = total;
    }
    state.montoInput.value = String(total);
  }
}

export function buildPedidoSubtype(state: TransaccionFormState): void {
  state.pedidoSubtypeContainer.empty();
  if (state.data.tipo_operacion !== "pedido") return;

  new Setting(state.pedidoSubtypeContainer)
    .setName(t("orderSubtype"))
    .addDropdown((dd: DropdownComponent) => {
      dd.addOption("compra", t("purchase"));
      dd.addOption("venta", t("sale"));
      dd.setValue(state.pedidoSubtype || "venta");
      dd.onChange((v) => {
        state.pedidoSubtype = v as "compra" | "venta";
        state.data.clase = v === "compra" ? "egreso" : "ingreso";
        state.data.categoria = "";
        buildCategoriaDropdown(state, state.categoriaContainer);
        buildDeudaSection(state);
        buildClienteProveedor(state);
      });
    });
}

export function buildCategoriaDropdown(state: TransaccionFormState, container: HTMLElement, categorias?: CategoriasData): void {
  container.empty();
  new Setting(container)
    .setName(t("category"))
    .addDropdown((dd: DropdownComponent) => {
      dd.addOption("", "—");
      const cats = categorias
        ? (state.data.clase === "ingreso"
            ? categorias.categoriasIngreso
            : categorias.categoriasEgreso)
        : [];
      for (const cat of cats) {
        dd.addOption(cat, cat);
      }
      dd.setValue(state.data.categoria || "");
      dd.onChange((v) => {
        state.data.categoria = v;
        if (!esCategoriaDeuda(v)) {
          state.data.deuda_ref = "";
          state.selectedDebtFile = null;
        }
        buildDeudaSection(state);
      });
    });
}

export function buildDeudaSection(state: TransaccionFormState): void {
  state.deudaContainer.empty();
  if (state.data.modalidad_pago !== "contado") return;
  const cat = state.data.categoria || "";
  if (!esCategoriaDeuda(cat)) return;

  const claseFiltro = state.data.clase === "ingreso" ? "a_favor" : "en_contra";
  const deudasPendientes = state.deudas.filter(
    (d) =>
      d.data.clase === claseFiltro &&
      d.data.estado !== "pagada" &&
      (d.data.monto_total || 0) > (d.data.monto_pagado || 0)
  );

  if (deudasPendientes.length === 0) {
    state.deudaContainer.createEl("p", {
      text: t("noDebtsAvailable"),
      cls: "ordermanager-text-muted",
    });
    const p = state.deudaContainer.querySelector("p") as HTMLElement;
    p.setCssProps({fontSize: "0.85em", margin: "8px 0"});
    return;
  }

  new Setting(state.deudaContainer)
    .setName(t("selectDebt"))
    .addDropdown((dd: DropdownComponent) => {
      dd.addOption("", "—");
      for (const d of deudasPendientes) {
        const restante = (d.data.monto_total || 0) - (d.data.monto_pagado || 0);
        const label = `${d.data.descripcion || "Deuda"} (${formatCurrency(restante, d.data.moneda)})`;
        dd.addOption(d.file.path, label);
      }

      if (state.data.deuda_ref) {
        dd.setValue(state.data.deuda_ref);
      }

      dd.onChange((filePath) => {
        if (!filePath) {
          state.data.deuda_ref = "";
          state.selectedDebtFile = null;
          return;
        }
        const match = deudasPendientes.find((d) => d.file.path === filePath);
        if (!match) return;

        state.data.deuda_ref = filePath;
        state.selectedDebtFile = match.file;
        const debt = match.data;
        const restante = (debt.monto_total || 0) - (debt.monto_pagado || 0);

        state.data.monto = restante;
        state.montoInput.value = String(restante);

        state.data.moneda = debt.moneda;
        try { state.monedaDd.setValue(debt.moneda); } catch { /* */ }

        if (debt.clase === "a_favor") {
          state.data.cliente = debt.cliente;
          state.data.proveedor = "";
          try { state.clienteDd.setValue(debt.cliente); } catch { /* */ }
          try { state.proveedorDd.setValue(""); } catch { /* */ }
        } else {
          state.data.proveedor = debt.proveedor;
          state.data.cliente = "";
          try { state.proveedorDd.setValue(debt.proveedor); } catch { /* */ }
          try { state.clienteDd.setValue(""); } catch { /* */ }
        }

        state.data.descripcion = `Abono: ${debt.descripcion || "Deuda"}`;
        state.descripcionInput.value = state.data.descripcion;
      });
    });
}

export function buildProductosList(state: TransaccionFormState): void {
  state.productosListEl.empty();
  if (state.selectedProducts.length === 0) {
    state.productosListEl.createEl("p", {
      text: t("noProducts"),
      cls: "ordermanager-text-muted",
    });
    return;
  }

  const table = state.productosListEl.createEl("table", { cls: "ordermanager-table" });
  const tbody = table.createEl("tbody");
  for (let i = 0; i < state.selectedProducts.length; i++) {
    const p = state.selectedProducts[i];
    const row = tbody.createEl("tr");
    row.createEl("td", { text: p.nombre });
    row.createEl("td", { text: `${parseFloat(p.cantidad.toFixed(3))} ud` });
    row.createEl("td", { text: formatCurrency(p.precio_unitario, state.data.moneda || "USD") });
    row.createEl("td", {
      text: formatCurrency(p.cantidad * p.precio_unitario, state.data.moneda || "USD"),
    });
    const delTd = row.createEl("td");
    const delBtn = delTd.createEl("button", { text: "×" });
    delBtn.addClass("ordermanager-btn-del");
    delBtn.onclick = () => {
      state.selectedProducts.splice(i, 1);
      state.data.productos = [...state.selectedProducts];
      actualizarMontoDesdeProductos(state);
      buildProductosList(state);
    };
  }
}

export function buildCreditoSection(state: TransaccionFormState): void {
  state.creditoContainer.empty();
  if (state.data.modalidad_pago !== "credito") return;

  const resumen = state.creditoContainer.createDiv();
  resumen.addClass("ordermanager-text-muted");
  resumen.setCssProps({fontSize: "0.9em", marginBottom: "8px"});
  const totalLabel = state.data.monto_total || state.data.monto || 0;
  resumen.createSpan({ text: `${t("totalAmount")}: ` });
  const totalVal = resumen.createSpan({ text: formatCurrency(totalLabel, state.data.moneda || "USD") });
  totalVal.setCssProps({fontWeight: "600", color: "var(--text-normal)"});

  new Setting(state.creditoContainer).setName(t("paidAmount")).addText((text) => {
    text.inputEl.type = "number";
    text.inputEl.step = "0.01";
    text.setValue(String(state.data.monto || 0));
    text.onChange((v) => {
      state.data.monto = parseFloat(v) || 0;
    });
  });

  const cuotasRow = state.creditoContainer.createDiv({ cls: "ordermanager-form-row" });
  new Setting(cuotasRow.createDiv()).setName(t("installments")).addText((text) => {
    text.inputEl.type = "number";
    text.setValue(String(state.data.cuotas || 1));
    text.onChange((v) => {
      state.data.cuotas = parseInt(v) || 1;
    });
  });
  new Setting(cuotasRow.createDiv()).setName(t("installmentsPaid")).addText((text) => {
    text.inputEl.type = "number";
    text.setValue(String(state.data.cuotas_pagadas || 0));
    text.onChange((v) => {
      state.data.cuotas_pagadas = parseInt(v) || 0;
    });
  });

  new Setting(state.creditoContainer).setName(t("interestRate")).addText((text) => {
    text.inputEl.type = "number";
    text.inputEl.step = "0.01";
    text.setValue(String(state.data.tasa_interes || 0));
    text.onChange((v) => {
      state.data.tasa_interes = parseFloat(v) || 0;
    });
  });

  new Setting(state.creditoContainer).setName(t("dueDate")).addText((text) => {
    text.inputEl.type = "date";
    text.setValue(state.data.fecha_vencimiento || "");
    text.onChange((v) => (state.data.fecha_vencimiento = v));
  });
}

export function buildClienteProveedor(state: TransaccionFormState): void {
  state.clienteContainer.empty();
  state.proveedorContainer.empty();

  const mostrarCliente =
    state.data.tipo_operacion === "venta" ||
    (state.data.tipo_operacion === "pedido" && state.pedidoSubtype === "venta");
  const mostrarProveedor =
    state.data.tipo_operacion === "compra" ||
    (state.data.tipo_operacion === "pedido" && state.pedidoSubtype === "compra");

  if (mostrarCliente) {
    new Setting(state.clienteContainer)
      .setName(t("clientDebtor"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const c of state.clientes) {
          dd.addOption(c.nombre, c.nombre);
        }
        dd.addOption("__new_client__", "➕ Nuevo cliente...");
        dd.setValue(state.data.cliente || "");
        dd.onChange((v) => { void (async () => {
          if (v === "__new_client__") {
            try { dd.setValue(state.data.cliente || ""); } catch { /* */ }
            new ClienteModal(state.app, state.plugin, () => { void (async () => {
              state.clientes = (await state.plugin.dataManager.getClientes()).map((c) => c.data);
              const sel = dd.selectEl;
              sel.empty();
              sel.createEl("option", { value: "", text: "—" });
              for (const c of state.clientes) {
                sel.createEl("option", { value: c.nombre, text: c.nombre });
              }
              sel.createEl("option", { value: "__new_client__", text: "➕ Nuevo cliente..." });
              const last = state.clientes[state.clientes.length - 1];
              if (last) { state.data.cliente = last.nombre; dd.setValue(last.nombre); }
            })(); }).open();
            return;
          }
          state.data.cliente = v;
        })(); });
        state.clienteDd = dd;
      });
  }

  if (mostrarProveedor) {
    new Setting(state.proveedorContainer)
      .setName(t("supplierCreditor"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "—");
        for (const p of state.proveedores) {
          dd.addOption(p.nombre, p.nombre);
        }
        dd.addOption("__new_supplier__", "➕ Nuevo proveedor...");
        dd.setValue(state.data.proveedor || "");
        dd.onChange((v) => { void (async () => {
          if (v === "__new_supplier__") {
            try { dd.setValue(state.data.proveedor || ""); } catch { /* */ }
            new ProveedorModal(state.app, state.plugin, () => { void (async () => {
              state.proveedores = (await state.plugin.dataManager.getProveedores()).map((p) => p.data);
              const sel = dd.selectEl;
              sel.empty();
              sel.createEl("option", { value: "", text: "—" });
              for (const p of state.proveedores) {
                sel.createEl("option", { value: p.nombre, text: p.nombre });
              }
              sel.createEl("option", { value: "__new_supplier__", text: "➕ Nuevo proveedor..." });
              const last = state.proveedores[state.proveedores.length - 1];
              if (last) { state.data.proveedor = last.nombre; dd.setValue(last.nombre); }
            })(); }).open();
            return;
          }
          state.data.proveedor = v;
        })(); });
        state.proveedorDd = dd;
      });
  }
}

export function buildFormFooter(
  contentEl: HTMLElement,
  form: HTMLElement,
  state: TransaccionFormState,
  saveCtx: SaveHandlerContext,
  existingFile: import("obsidian").TFile | null
): void {
  const compRow = form.createDiv({ cls: "setting-item" });
  const compInfo = compRow.createDiv({ cls: "setting-item-info" });
  compInfo.createDiv({ cls: "setting-item-name", text: t("receipt") });
  const compControl = compRow.createDiv({ cls: "setting-item-control" });
  const compPreview = form.createDiv();
  compPreview.setCssProps({margin: "4px 0 12px 0"});
  renderComprobante(state, compControl, compPreview);

  const recRow = form.createDiv({ cls: "ordermanager-form-row" });
  new Setting(recRow.createDiv())
    .setName("Recurrente")
    .addDropdown((dd: DropdownComponent) => {
      dd.addOption("", "No");
      dd.addOption("semanal", "Semanal");
      dd.addOption("quincenal", "Quincenal");
      dd.addOption("mensual", "Mensual");
      dd.addOption("anual", "Anual");
      dd.setValue(state.data.recurrente || "");
      dd.onChange((v) => (state.data.recurrente = v));
    });
  new Setting(recRow.createDiv())
    .setName("Válido hasta")
    .addText((text) => {
      text.inputEl.type = "date";
      text.setValue(state.data.recurrente_hasta || "");
      text.onChange((v) => (state.data.recurrente_hasta = v));
    });

  const actions = contentEl.createDiv({ cls: "ordermanager-form-actions" });
  actions.createEl("button", { text: t("cancel"), cls: "secondary" }).onclick = () =>
    saveCtx.close();
  if (existingFile) {
    actions.createEl("button", { text: t("delete"), cls: "danger" }).onclick = () => { void (async () => {
      if (!await confirmAction(saveCtx.app, "¿Eliminar esta transacción?")) return;
      await saveCtx.plugin.dataManager.deleteTransaccion(existingFile);
      saveCtx.onSubmit();
      saveCtx.close();
    })(); };
  }
  if (existingFile && state.data.tipo_operacion === "pedido" && state.data.estado === "pedido") {
    actions.createEl("button", { text: t("deliver"), cls: "primary" }).onclick = () => {
      void handleDeliver(saveCtx);
    };
  }
  actions.createEl("button", { text: t("generateTicket") }).onclick = () => {
    void handleGenerateTicket(saveCtx);
  };
  actions.createEl("button", { text: t("save"), cls: "primary" }).onclick = () => {
    void handleSave(saveCtx);
  };
}


