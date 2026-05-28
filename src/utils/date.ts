export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function now(): string {
  return new Date().toISOString();
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
    return date.toLocaleDateString("es-PY", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function monthStart(date?: Date): string {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthEnd(date?: Date): string {
  const d = date || new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
}

export function isOverdue(fechaVencimiento: string): boolean {
  if (!fechaVencimiento) return false;
  return new Date(fechaVencimiento + "T00:00:00") < new Date();
}

export function monthsBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

export function weekStart(date?: Date): string {
  const d = date || new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split("T")[0];
}

export function weekEnd(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday.toISOString().split("T")[0];
}

export function yearStart(date?: Date): string {
  const d = date || new Date();
  return `${d.getFullYear()}-01-01`;
}

export function yearEnd(date?: Date): string {
  const d = date || new Date();
  return `${d.getFullYear()}-12-31`;
}

export function quarterStart(date?: Date): string {
  const d = date || new Date();
  const q = Math.floor(d.getMonth() / 3);
  return `${d.getFullYear()}-${String(q * 3 + 1).padStart(2, "0")}-01`;
}

export function quarterEnd(date?: Date): string {
  const d = date || new Date();
  const q = Math.floor(d.getMonth() / 3);
  const lastDay = new Date(d.getFullYear(), q * 3 + 3, 0);
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
}

export function lastYearStart(): string {
  const d = new Date();
  return `${d.getFullYear() - 1}-01-01`;
}

export function lastYearEnd(): string {
  const d = new Date();
  return `${d.getFullYear() - 1}-12-31`;
}
