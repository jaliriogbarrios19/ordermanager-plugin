import { TFile, Notice } from "obsidian";
import type OrderManagerPlugin from "../main";
import type { TransaccionData, DeudaData, ProductoEnTransaccion } from "../types";
import { today } from "../utils/date";
import { convertir } from "../utils/exchange";
import { t } from "../i18n";
import { confirmAction } from "../utils/confirm";
import { TicketModal } from "./ticket-modal";

export interface SaveHandlerContext {
  app: import("obsidian").App;
  plugin: OrderManagerPlugin;
  data: Partial<TransaccionData>;
  selectedProducts: ProductoEnTransaccion[];
  selectedDebtFile: TFile | null;
  pedidoSubtype: "compra" | "venta" | null;
  existingFile: TFile | null;
  onSubmit: () => void;
  close: () => void;
}

export async function handleDeliver(ctx: SaveHandlerContext): Promise<void> {
  if (!(ctx.data.monto && ctx.data.monto > 0) && ctx.data.modalidad_pago !== "credito") {
    new Notice(t("amountRequired"));
    return;
  }

  ctx.data.productos = [...ctx.selectedProducts];
  const ref = ctx.plugin.settings.tasaReferencia || "USD";
  const rates = ctx.plugin.settings.tasasCambio || { USD: 1 };
  const isCompra = ctx.pedidoSubtype === "compra";

  if (ctx.data.modalidad_pago === "credito") {
    const montoTotal = ctx.data.monto_total || 0;
    const montoPagado = ctx.data.monto || 0;
    if (montoTotal <= 0) {
      new Notice(t("totalAmountRequired"));
      return;
    }
    const deudaClase = ctx.data.clase === "ingreso" ? "a_favor" : "en_contra";
    const deudaData: Partial<DeudaData> = {
      tipo: "deuda", clase: deudaClase, deuda_tipo: "dinero",
      monto_total: montoTotal, monto_pagado: montoPagado,
      moneda: ctx.data.moneda || ctx.plugin.settings.defaultCurrency,
      fecha_inicio: ctx.data.fecha || today(),
      fecha_vencimiento: ctx.data.fecha_vencimiento || "",
      cliente: ctx.data.cliente || "", proveedor: ctx.data.proveedor || "",
      descripcion: ctx.data.descripcion || "",
      estado: montoPagado >= montoTotal ? "pagada" : "pendiente",
      cuotas: ctx.data.cuotas || 1, cuotas_pagadas: ctx.data.cuotas_pagadas || 0,
      tasa_interes: ctx.data.tasa_interes || 0,
      monto_referencia: convertir(montoTotal, ctx.data.moneda || "USD", rates, ref),
    };
    const deudaFile = await ctx.plugin.dataManager.saveDeuda(deudaData);
    if (montoPagado > 0) {
      ctx.data.estado = "confirmado";
      ctx.data.monto = montoPagado;
      ctx.data.monto_referencia = convertir(montoPagado, ctx.data.moneda || "USD", rates, ref);
      ctx.data.deuda_ref = deudaFile.path;
      ctx.data.monto_total = montoTotal;
      await ctx.plugin.dataManager.saveTransaccion(
        { ...ctx.data, productos: [...ctx.selectedProducts] },
        ctx.existingFile || undefined
      );
    }
    if (isCompra && ctx.selectedProducts.length > 0) {
      await ctx.plugin.dataManager.actualizarInventario({
        clase: ctx.data.clase, productos: ctx.selectedProducts,
      });
    }
  } else {
    ctx.data.estado = "confirmado";
    ctx.data.monto_referencia = convertir(
      ctx.data.monto || 0, ctx.data.moneda || "USD", rates, ref
    );
    await ctx.plugin.dataManager.saveTransaccion(ctx.data, ctx.existingFile || undefined);
    if (isCompra && ctx.selectedProducts.length > 0) {
      await ctx.plugin.dataManager.actualizarInventario({
        clase: ctx.data.clase, productos: ctx.selectedProducts,
      });
    }
  }

  ctx.onSubmit();
  ctx.close();
}

export async function handleGenerateTicket(ctx: SaveHandlerContext): Promise<void> {
  const faltanCampos = !ctx.data.monto || !ctx.data.fecha || !ctx.data.cliente;
  if (faltanCampos) {
    if (!await confirmAction(ctx.app, t("incompleteFields"))) return;
  }
  const clientes = await ctx.plugin.dataManager.getClientes();
  const cliente = clientes.find((c) => c.data.nombre === ctx.data.cliente);
  new TicketModal(ctx.app, ctx.plugin, ctx.data as TransaccionData, cliente?.data).open();
}

export async function handleSave(ctx: SaveHandlerContext): Promise<void> {
  if (!(ctx.data.monto && ctx.data.monto > 0) && ctx.data.modalidad_pago !== "credito") {
    new Notice(t("amountRequired"));
    return;
  }

  ctx.data.productos = [...ctx.selectedProducts];

  const isNewPedido = ctx.data.tipo_operacion === "pedido" && !ctx.existingFile;

  const ref = ctx.plugin.settings.tasaReferencia || "USD";
  const rates = ctx.plugin.settings.tasasCambio || { USD: 1 };

  if (ctx.data.modalidad_pago === "credito") {
    const montoTotal = ctx.data.monto_total || 0;
    const montoPagado = ctx.data.monto || 0;

    if (montoTotal <= 0) {
      new Notice(t("totalAmountRequired"));
      return;
    }

    const deudaClase = ctx.data.clase === "ingreso" ? "a_favor" : "en_contra";
    let deudaFile: TFile | null = null;

    const deudaData: Partial<DeudaData> = {
      tipo: "deuda",
      clase: deudaClase,
      deuda_tipo: "dinero",
      monto_total: montoTotal,
      monto_pagado: montoPagado,
      moneda: ctx.data.moneda || ctx.plugin.settings.defaultCurrency,
      fecha_inicio: ctx.data.fecha || today(),
      fecha_vencimiento: ctx.data.fecha_vencimiento || "",
      cliente: ctx.data.cliente || "",
      proveedor: ctx.data.proveedor || "",
      descripcion: ctx.data.descripcion || "",
      estado: montoPagado >= montoTotal ? "pagada" : "pendiente",
      cuotas: ctx.data.cuotas || 1,
      cuotas_pagadas: ctx.data.cuotas_pagadas || 0,
      tasa_interes: ctx.data.tasa_interes || 0,
      monto_referencia: convertir(montoTotal, ctx.data.moneda || "USD", rates, ref),
    };

    deudaFile = await ctx.plugin.dataManager.saveDeuda(deudaData);

    if (ctx.selectedProducts.length > 0 && !(isNewPedido && ctx.data.clase === "egreso")) {
      await ctx.plugin.dataManager.actualizarInventario({
        clase: ctx.data.clase,
        productos: ctx.selectedProducts,
      });
    }

    if (montoPagado > 0) {
      ctx.data.monto = montoPagado;
      ctx.data.monto_referencia = convertir(montoPagado, ctx.data.moneda || "USD", rates, ref);
      ctx.data.deuda_ref = deudaFile.path;
      ctx.data.monto_total = montoTotal;

      if (isNewPedido) {
        ctx.data.estado = "pedido";
      }

      const saveData: Partial<TransaccionData> = {
        ...ctx.data,
        productos: [...ctx.selectedProducts],
      };

      await ctx.plugin.dataManager.saveTransaccion(
        saveData,
        ctx.existingFile || undefined
      );
    }
  } else {
    if (ctx.selectedProducts.length > 0) {
      ctx.data.monto = ctx.selectedProducts.reduce(
        (sum, p) => sum + p.cantidad * p.precio_unitario,
        0
      );
    }

    ctx.data.monto_referencia = convertir(
      ctx.data.monto || 0,
      ctx.data.moneda || "USD",
      rates,
      ref
    );

    if (isNewPedido) {
      ctx.data.estado = "pedido";
    }

    await ctx.plugin.dataManager.saveTransaccion(
      ctx.data,
      ctx.existingFile || undefined
    );

    if (isNewPedido && ctx.data.clase === "ingreso" && ctx.selectedProducts.length > 0) {
      await ctx.plugin.dataManager.actualizarInventario({
        clase: ctx.data.clase,
        productos: ctx.selectedProducts,
      });
    }

    if (ctx.data.deuda_ref && ctx.selectedDebtFile) {
      const deudaFile = ctx.selectedDebtFile;
      try {
        const freshDeudas = await ctx.plugin.dataManager.getDeudas();
        const fresh = freshDeudas.find((d) => d.file.path === deudaFile.path);
        if (fresh) {
          const debt = fresh.data;
          const newPagado = (debt.monto_pagado || 0) + (ctx.data.monto || 0);
          const updated = newPagado >= (debt.monto_total || 0) ? "pagada" : debt.estado;
          await ctx.plugin.dataManager.saveDeuda(
            { ...debt, monto_pagado: newPagado, estado: updated },
            deudaFile
          );
        }
      } catch (err) {
        console.error("OrderManager: error al actualizar deuda vinculada", err);
      }
    }
  }

  ctx.onSubmit();
  ctx.close();
}
