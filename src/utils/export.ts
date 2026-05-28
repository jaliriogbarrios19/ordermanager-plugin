import type { TransaccionData, ClienteData, ProveedorData, ProductoData, DeudaData } from "../types";

export function exportToCSV(transacciones: Array<{ data: TransaccionData }>): string {
  const headers = [
    "Fecha", "Clase", "Monto", "Moneda", "Categoría",
    "Cliente", "Proveedor", "Descripción", "Medio de pago", "Estado",
  ];
  const rows = transacciones.map((t) => {
    const d = t.data;
    return [
      d.fecha, d.clase === "ingreso" ? "Ingreso" : "Egreso", d.monto.toString(),
      d.moneda, d.categoria, d.cliente || "", d.proveedor || "",
      d.descripcion || "", d.medio_pago || "", d.estado || "",
    ];
  });
  return buildCSV(headers, rows);
}

export function exportClientesCSV(clientes: Array<{ data: ClienteData }>): string {
  const headers = ["Nombre", "RUC", "Email", "Teléfono", "Dirección", "Categoría"];
  const rows = clientes.map((c) => [c.data.nombre, c.data.ruc, c.data.email, c.data.telefono, c.data.direccion, c.data.categoria]);
  return buildCSV(headers, rows);
}

export function exportProveedoresCSV(proveedores: Array<{ data: ProveedorData }>): string {
  const headers = ["Nombre", "RUC", "Email", "Teléfono", "Dirección", "Categoría"];
  const rows = proveedores.map((p) => [p.data.nombre, p.data.ruc, p.data.email, p.data.telefono, p.data.direccion, p.data.categoria]);
  return buildCSV(headers, rows);
}

export function exportProductosCSV(productos: Array<{ data: ProductoData }>): string {
  const headers = ["Nombre", "Descripción", "Precio costo", "Precio venta", "Stock", "Categoría", "Proveedor"];
  const rows = productos.map((p) => [p.data.nombre, p.data.descripcion, String(p.data.precio_costo), String(p.data.precio_venta), String(p.data.stock), p.data.categoria, p.data.proveedor]);
  return buildCSV(headers, rows);
}

export function exportDeudasCSV(deudas: Array<{ data: DeudaData }>): string {
  const headers = ["Tipo", "Descripción", "Monto total", "Monto pagado", "Restante", "Vencimiento", "Contacto", "Estado"];
  const rows = deudas.map((d) => [
    d.data.clase === "a_favor" ? "A favor" : "En contra", d.data.descripcion,
    String(d.data.monto_total), String(d.data.monto_pagado),
    String((d.data.monto_total || 0) - (d.data.monto_pagado || 0)),
    d.data.fecha_vencimiento, d.data.cliente || d.data.proveedor, d.data.estado,
  ]);
  return buildCSV(headers, rows);
}

function buildCSV(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCSV).join(","), ...rows.map((row) => row.map(escapeCSV).join(","))];
  return lines.join("\n");
}

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
