import { stringifyYaml } from "./parser";
import { today, now } from "../utils/date";
import type { ClienteData, ProveedorData, TransaccionData, DeudaData, ProductoData } from "../types";

export function clienteTemplate(data: Partial<ClienteData>): string {
  const fm: Record<string, unknown> = {
    tipo: "cliente",
    nombre: data.nombre || "",
    ruc: data.ruc || "",
    email: data.email || "",
    telefono: data.telefono || "",
    direccion: data.direccion || "",
    categoria: data.categoria || "",
    created: data.created || now(),
    updated: data.updated || now(),
  };

  return `---\n${stringifyYaml(fm)}\n---\n# ${data.nombre || "Nuevo Cliente"}\n`;
}

export function proveedorTemplate(data: Partial<ProveedorData>): string {
  const fm: Record<string, unknown> = {
    tipo: "proveedor",
    nombre: data.nombre || "",
    ruc: data.ruc || "",
    email: data.email || "",
    telefono: data.telefono || "",
    direccion: data.direccion || "",
    categoria: data.categoria || "",
    created: data.created || now(),
    updated: data.updated || now(),
  };

  return `---\n${stringifyYaml(fm)}\n---\n# ${data.nombre || "Nuevo Proveedor"}\n`;
}

export function transaccionTemplate(data: Partial<TransaccionData>): string {
  const monto = data.monto || 0;
  const fm: Record<string, unknown> = {
    tipo: "transaccion",
    clase: data.clase || "ingreso",
    monto: monto,
    monto_referencia: data.monto_referencia ?? 0,
    moneda: data.moneda || "USD",
    fecha: data.fecha || today(),
    categoria: data.categoria || "",
    cliente: data.cliente || "",
    proveedor: data.proveedor || "",
    descripcion: data.descripcion || "",
    medio_pago: data.medio_pago || "",
    comprobante: data.comprobante || "",
    estado: data.estado || "confirmado",
    created: data.created || now(),
    updated: data.updated || now(),
    recurrente: data.recurrente || "",
    recurrente_hasta: data.recurrente_hasta || "",
  };

  const tipo = data.clase === "egreso" ? "Egreso" : "Ingreso";
  const titulo = data.descripcion || `${tipo} - ${data.categoria || ""}`;
  return `---\n${stringifyYaml(fm)}\n---\n# ${titulo}\n\nMonto: ${data.moneda || "USD"} ${monto}\n`;
}

export function deudaTemplate(data: Partial<DeudaData>): string {
  const fm: Record<string, unknown> = {
    tipo: "deuda",
    clase: data.clase || "a_favor",
    monto_total: data.monto_total || 0,
    monto_pagado: data.monto_pagado || 0,
    moneda: data.moneda || "USD",
    fecha_inicio: data.fecha_inicio || today(),
    fecha_vencimiento: data.fecha_vencimiento || "",
    cliente: data.cliente || "",
    proveedor: data.proveedor || "",
    descripcion: data.descripcion || "",
    estado: data.estado || "pendiente",
    cuotas: data.cuotas || 1,
    cuotas_pagadas: data.cuotas_pagadas || 0,
    tasa_interes: data.tasa_interes || 0,
    created: data.created || now(),
    updated: data.updated || now(),
  };

  const tipo = data.clase === "a_favor" ? "Deuda a favor" : "Deuda en contra";
  return `---\n${stringifyYaml(fm)}\n---\n# ${tipo} - ${data.descripcion || "Nueva Deuda"}\n`;
}

export function productoTemplate(data: Partial<ProductoData>): string {
  const fm: Record<string, unknown> = {
    tipo: "producto",
    nombre: data.nombre || "",
    descripcion: data.descripcion || "",
    precio_costo: data.precio_costo ?? 0,
    precio_venta: data.precio_venta || 0,
    stock: data.stock ?? 0,
    stock_minimo: data.stock_minimo ?? 0,
    categoria: data.categoria || "",
    proveedor: data.proveedor || "",
    moneda: data.moneda || "USD",
    created: data.created || now(),
    updated: data.updated || now(),
    margen_ganancia: data.margen_ganancia ?? 30,
    porcion: data.porcion ?? 1,
    receta: JSON.stringify(data.receta || []),
  };

  return `---\n${stringifyYaml(fm)}\n---\n# ${data.nombre || "Nuevo Producto"}\n`;
}
