export interface ClienteData {
  tipo: "cliente";
  nombre: string;
  ruc: string;
  email: string;
  telefono: string;
  direccion: string;
  categoria: string;
  created: string;
  updated: string;
}

export interface ProveedorData {
  tipo: "proveedor";
  nombre: string;
  ruc: string;
  email: string;
  telefono: string;
  direccion: string;
  categoria: string;
  created: string;
  updated: string;
}

export type TransaccionClase = "ingreso" | "egreso";

export interface TransaccionData {
  tipo: "transaccion";
  clase: TransaccionClase;
  monto: number;
  moneda: string;
  fecha: string;
  categoria: string;
  cliente: string;
  proveedor: string;
  producto: string;
  descripcion: string;
  medio_pago: string;
  comprobante: string;
  estado: string;
  created: string;
  updated: string;
  recurrente: string;
  recurrente_hasta: string;
}

export type DeudaClase = "a_favor" | "en_contra";
export type DeudaEstado = "pendiente" | "pagada" | "vencida";

export interface DeudaData {
  tipo: "deuda";
  clase: DeudaClase;
  monto_total: number;
  monto_pagado: number;
  moneda: string;
  fecha_inicio: string;
  fecha_vencimiento: string;
  cliente: string;
  proveedor: string;
  descripcion: string;
  estado: DeudaEstado;
  cuotas: number;
  cuotas_pagadas: number;
  tasa_interes: number;
  created: string;
  updated: string;
}

export interface ProductoData {
  tipo: "producto";
  nombre: string;
  descripcion: string;
  precio_costo: number;
  precio_venta: number;
  stock: number;
  stock_minimo: number;
  categoria: string;
  proveedor: string;
  moneda: string;
  created: string;
  updated: string;
}

export type EntidadData =
  | ClienteData
  | ProveedorData
  | TransaccionData
  | DeudaData
  | ProductoData;

export interface OrderManagerSettings {
  baseFolder: string;
  defaultCurrency: string;
  language: string;
  libros: string[];
  libroActivo: string;
  tasaReferencia: string;
  tasasCambio: Record<string, number>;
  bcvPrice: number;
  fechaTasas: string;
  onboardingComplete: boolean;
  categoriasIngreso: string[];
  categoriasEgreso: string[];
  mediosPago: string[];
  categoriasProducto: string[];
  categoriasCliente: string[];
}

export const FIAT_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CNY",
  "ARS", "BOB", "BRL", "CLP", "COP",
  "MXN", "PYG", "PEN", "UYU", "VES",
  "CHF", "AUD", "CAD", "INR", "KRW",
];

export const CRYPTO_CURRENCIES = [
  "USDT", "BTC", "ETH", "USDC", "BNB",
  "XRP", "ADA", "SOL", "DOT", "DOGE",
];

export interface MonedaSource {
  label: string;
  code: string;
  source: "dolarapi" | "binance" | "fiat" | "manual";
  displayFactor: number;
}

export const MONEDA_SOURCES: MonedaSource[] = [
  { label: "Dólar BCV", code: "VES_BCV", source: "dolarapi", displayFactor: 1 },
  { label: "USDT", code: "USDT", source: "binance", displayFactor: 1 },
  { label: "Bolívar (VES)", code: "VES", source: "fiat", displayFactor: 1 },
  { label: "Euro BCV", code: "EUR", source: "dolarapi", displayFactor: 1 },
  { label: "Peso Colombiano", code: "COP", source: "fiat", displayFactor: 1 },
  { label: "Real Brasileño", code: "BRL", source: "fiat", displayFactor: 1 },
  { label: "Peso Argentino", code: "ARS", source: "fiat", displayFactor: 1 },
  { label: "Sol Peruano", code: "PEN", source: "fiat", displayFactor: 1 },
  { label: "Peso Chileno", code: "CLP", source: "fiat", displayFactor: 1 },
  { label: "Boliviano", code: "BOB", source: "fiat", displayFactor: 1 },
  { label: "Peso Mexicano", code: "MXN", source: "fiat", displayFactor: 1 },
  { label: "Guaraní", code: "PYG", source: "fiat", displayFactor: 1 },
  { label: "Peso Uruguayo", code: "UYU", source: "fiat", displayFactor: 1 },
  { label: "Libra Esterlina", code: "GBP", source: "fiat", displayFactor: 1 },
  { label: "Yen Japonés", code: "JPY", source: "fiat", displayFactor: 1 },
  { label: "Yuan Chino", code: "CNY", source: "fiat", displayFactor: 1 },
  { label: "Franco Suizo", code: "CHF", source: "fiat", displayFactor: 1 },
  { label: "Dólar Australiano", code: "AUD", source: "fiat", displayFactor: 1 },
  { label: "Dólar Canadiense", code: "CAD", source: "fiat", displayFactor: 1 },
  { label: "Rupia India", code: "INR", source: "fiat", displayFactor: 1 },
  { label: "Won Surcoreano", code: "KRW", source: "fiat", displayFactor: 1 },
  { label: "Bitcoin", code: "BTC", source: "binance", displayFactor: 1 },
  { label: "Ethereum", code: "ETH", source: "binance", displayFactor: 1 },
  { label: "USDC", code: "USDC", source: "binance", displayFactor: 1 },
];

export const DEFAULT_SETTINGS: OrderManagerSettings = {
  baseFolder: "OrderManager",
  defaultCurrency: "USD",
  language: "es",
  libros: ["Principal"],
  libroActivo: "Principal",
  tasaReferencia: "USD",
  tasasCambio: { "USD": 1 },
  bcvPrice: 0,
  fechaTasas: "",
  onboardingComplete: false,
  categoriasIngreso: ["Ventas", "Servicios", "Consultoría", "Inversiones", "Otros ingresos"],
  categoriasEgreso: ["Insumos", "Servicios", "Impuestos", "Salarios", "Alquiler", "Servicios públicos", "Marketing", "Otros egresos"],
  mediosPago: ["Efectivo", "Transferencia", "Tarjeta de crédito", "Tarjeta de débito", "Cheque", "Billetera digital"],
  categoriasProducto: ["General", "Materia prima", "Producto terminado", "Servicio"],
  categoriasCliente: ["Minorista", "Mayorista", "Corporativo"],
};
