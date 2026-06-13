import type { TransaccionData } from "../types";
import { now, today } from "../utils/date";
import type { DataManager } from "./manager";

export async function processRecurring(dm: DataManager): Promise<void> {
  const transacciones = await dm.getTransacciones();
  const hoy = today();
  for (const t of transacciones) {
    const d = t.data;
    if (!d.recurrente || !d.fecha) continue;
    if (d.recurrente_hasta && d.recurrente_hasta < hoy) continue;

    const lastDate = new Date(d.fecha + "T00:00:00");
    const nextDate = new Date(lastDate);
    if (d.recurrente === "semanal") nextDate.setDate(nextDate.getDate() + 7);
    else if (d.recurrente === "quincenal") nextDate.setDate(nextDate.getDate() + 15);
    else if (d.recurrente === "mensual") nextDate.setMonth(nextDate.getMonth() + 1);
    else if (d.recurrente === "anual") nextDate.setFullYear(nextDate.getFullYear() + 1);
    else continue;

    const nextStr = nextDate.toISOString().split("T")[0];
    if (nextStr > hoy) continue;
    if (d.recurrente_hasta && nextStr > d.recurrente_hasta) continue;

    const alreadyExists = transacciones.some(
      (ot) =>
        ot.data.recurrente === d.recurrente &&
        ot.data.fecha === nextStr &&
        ot.data.categoria === d.categoria &&
        ot.data.monto === d.monto
    );
    if (alreadyExists) continue;

    const newData: Partial<TransaccionData> = {
      ...d,
      fecha: nextStr,
      created: now(),
      updated: now(),
    };
    await dm.saveTransaccion(newData);
  }
}
