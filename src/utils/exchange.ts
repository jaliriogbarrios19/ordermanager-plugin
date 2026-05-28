import { requestUrl } from "obsidian";
import type { MonedaSource } from "../types";
import { MONEDA_SOURCES } from "../types";

export interface ExchangeRates {
  [key: string]: number;
}

function getSource(code: string): MonedaSource | undefined {
  return MONEDA_SOURCES.find((s) => s.code === code);
}

async function apiGet(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    clearTimeout(timeout);
    console.error(`[OrderManager] API error: ${url}`, e);
    return null;
  }
}

async function fetchDolarApi(rates: ExchangeRates, codes: string[]): Promise<void> {
  const data = await apiGet("https://ve.dolarapi.com/v1/dolares");
  if (!data || !Array.isArray(data)) {
    console.warn("[OrderManager] DolarAPI: no data or invalid format");
    return;
  }
  for (const item of data as Array<Record<string, unknown>>) {
    const fuente = String(item.fuente || "");
    const nombre = String(item.nombre || "");
    const price = Number(item.promedio || 0);
    if (!price || price <= 0) continue;

    if (fuente === "oficial" && nombre === "Dólar") {
      rates["_BCV_PRICE"] = price;
      if (codes.includes("VES_BCV")) rates["VES_BCV"] = 1;
      console.log("[OrderManager] BCV:", price);
    }

    if (codes.includes("USDT") && (fuente === "paralelo" || nombre === "Paralelo" || nombre.includes("paralelo"))) {
      const bcvPrice = rates["_BCV_PRICE"];
      if (bcvPrice && bcvPrice > 0) {
        rates["USDT"] = price / bcvPrice;
      } else {
        rates["USDT"] = 1;
      }
      console.log("[OrderManager] USDT via DolarAPI paralelo:", price, "computed rate:", rates["USDT"]);
    }
  }
}

async function fetchBinance(rates: ExchangeRates, codes: string[]): Promise<void> {
  const symbols: string[] = [];
  const cryptoCodes = new Set(["USDT", "USDC", "BTC", "ETH", "BNB", "XRP", "ADA", "SOL", "DOT", "DOGE"]);
  for (const c of codes) {
    if (cryptoCodes.has(c) && c !== "USDT" && c !== "USDC") {
      symbols.push(`${c}USDT`);
    }
  }
  if (codes.includes("USDT") || codes.includes("VES_BCV")) {
    symbols.push("USDTVES");
  }

  for (const sym of symbols) {
    try {
      const r = await requestUrl({
        url: `https://api.binance.com/api/v3/ticker/price?symbol=${sym}`,
        method: "GET",
      });
      if (r.status === 200 && (r.json as { price: string }).price) {
        const price = parseFloat((r.json as { price: string }).price);
        if (!isNaN(price) && price > 0) {
          if (sym === "USDTVES") {
            const vesPerUsdt = price;
            if (codes.includes("USDT")) {
              const bcvPrice = rates["_BCV_PRICE"];
              if (bcvPrice && bcvPrice > 0) {
                rates["USDT"] = vesPerUsdt / bcvPrice;
              } else {
                rates["USDT"] = 1;
              }
            }
            console.log("[OrderManager] Binance USDTVES:", vesPerUsdt, "USDT rate:", rates["USDT"]);
          } else {
            const coin = sym.replace("USDT", "");
            rates[coin] = price;
          }
        }
      }
    } catch (e) {
      console.warn("[OrderManager] Binance error:", sym, e);
    }
  }
}

async function fetchFiat(rates: ExchangeRates, codes: string[]): Promise<void> {
  const data = await apiGet("https://open.er-api.com/v6/latest/USD");
  if (!data || !(data as { rates: Record<string, number> }).rates) {
    console.warn("[OrderManager] Fiat API: no data");
    return;
  }
  const fiatRates = (data as { rates: Record<string, number> }).rates;
  for (const code of codes) {
    const source = getSource(code);
    if (source && source.source === "fiat" && fiatRates[code]) {
      rates[code] = 1 / fiatRates[code];
    }
  }
  for (const code of codes) {
    if (!rates[code] && fiatRates[code]) {
      const src = getSource(code);
      if (!src || src.source === "manual") {
        rates[code] = 1 / fiatRates[code];
      }
    }
  }
  console.log("[OrderManager] Fiat API OK, codes found:", Object.keys(rates).filter((k) => codes.includes(k)));
}

export async function fetchExchangeRates(monedas: string[]): Promise<ExchangeRates> {
  const rates: ExchangeRates = { USD: 1 };

  const dolarApiCodes = monedas.filter((c) => getSource(c)?.source === "dolarapi");
  const binanceCodes = monedas.filter((c) => getSource(c)?.source === "binance");
  const fiatCodes = monedas.filter((c) => getSource(c)?.source === "fiat" || !getSource(c));

  console.log("[OrderManager] Fetching rates for:", monedas);

  if (dolarApiCodes.length > 0) await fetchDolarApi(rates, monedas);
  if (binanceCodes.length > 0) await fetchBinance(rates, monedas);
  if (fiatCodes.length > 0) await fetchFiat(rates, monedas);

  console.log("[OrderManager] Final rates:", rates);
  return rates;
}

export function convertir(
  monto: number,
  moneda: string,
  rates: Record<string, number>,
  referencia: string
): number {
  const rate = rates[moneda];
  if (!rate || rate === 0) return monto;
  return (monto * rate) / (rates[referencia] || 1);
}

export function rebaseRates(
  rates: Record<string, number>,
  nuevaReferencia: string
): Record<string, number> {
  const factor = rates[nuevaReferencia];
  if (!factor || factor === 0) return rates;
  const result: Record<string, number> = {};
  for (const [cur, val] of Object.entries(rates)) {
    result[cur] = val / factor;
  }
  return result;
}
