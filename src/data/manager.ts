import { TFile, TFolder, Vault, normalizePath } from "obsidian";
import { parseFrontmatterFromContent, buildMarkdownNote, stringifyYaml } from "./parser";
import { clienteTemplate, proveedorTemplate, transaccionTemplate, deudaTemplate, productoTemplate } from "./templates";
import type {
  ClienteData,
  ProveedorData,
  TransaccionData,
  DeudaData,
  ProductoData,
  OrderManagerSettings,
} from "../types";
import { now, today } from "../utils/date";

export class DataManager {
  private vault: Vault;
  private settings: OrderManagerSettings;

  constructor(vault: Vault, settings: OrderManagerSettings) {
    this.vault = vault;
    this.settings = settings;
  }

  updateSettings(settings: OrderManagerSettings) {
    this.settings = settings;
  }

  private basePath(subfolder: string): string {
    return normalizePath(`${this.settings.baseFolder}/${this.settings.negocioActivo}/${subfolder}`);
  }

  async ensureFolder(path: string): Promise<TFolder> {
    const normalized = normalizePath(path);
    let folder = this.vault.getAbstractFileByPath(normalized);
    if (folder && folder instanceof TFolder) return folder;
    return await this.vault.createFolder(normalized);
  }

  async ensureBaseFolders(): Promise<void> {
    const base = normalizePath(`${this.settings.baseFolder}/${this.settings.negocioActivo}`);
    await this.ensureFolder(base);
    await this.ensureFolder(`${base}/Clientes`);
    await this.ensureFolder(`${base}/Proveedores`);
    await this.ensureFolder(`${base}/Transacciones`);
    await this.ensureFolder(`${base}/Deudas`);
    await this.ensureFolder(`${base}/Inventario`);
  }

  private async readFrontmatter(file: TFile): Promise<Record<string, unknown>> {
    const content = await this.vault.cachedRead(file);
    return parseFrontmatterFromContent(content).frontmatter;
  }

  private async readAllFrontmatter(folder: string): Promise<Array<{ file: TFile; data: Record<string, unknown> }>> {
    await this.ensureFolder(folder);
    const folderObj = this.vault.getAbstractFileByPath(folder);
    if (!(folderObj instanceof TFolder)) return [];

    const files = folderObj.children.filter((f): f is TFile => f instanceof TFile && f.extension === "md");
    const results: Array<{ file: TFile; data: Record<string, unknown> }> = [];

    for (const file of files) {
      try {
        const data = await this.readFrontmatter(file);
        results.push({ file, data });
      } catch {
        // skip corrupt files
      }
    }

    return results;
  }

  private async listFilesRecursive(folder: string): Promise<TFile[]> {
    await this.ensureFolder(folder);
    const folderObj = this.vault.getAbstractFileByPath(folder);
    if (!(folderObj instanceof TFolder)) return [];

    const files: TFile[] = [];
    const stack: (TFolder | TFile)[] = [...(folderObj.children as (TFolder | TFile)[])];

    while (stack.length > 0) {
      const item = stack.pop()!;
      if (item instanceof TFile && item.extension === "md") {
        files.push(item);
      } else if (item instanceof TFolder) {
        stack.push(...(item.children as (TFolder | TFile)[]));
      }
    }

    return files;
  }

  private async saveNewFile(folder: string, filename: string, content: string): Promise<TFile> {
    await this.ensureFolder(folder);
    const path = normalizePath(`${folder}/${filename}.md`);

    let finalPath = path;
    let counter = 1;
    while (this.vault.getAbstractFileByPath(finalPath)) {
      finalPath = normalizePath(`${folder}/${filename}-${counter}.md`);
      counter++;
    }

    return await this.vault.create(finalPath, content);
  }

  private async updateFile(file: TFile, frontmatter: Record<string, unknown>, body?: string): Promise<void> {
    frontmatter.updated = now();
    const content = buildMarkdownNote(frontmatter, body || "");
    await this.vault.modify(file, content);
  }

  async deleteFile(file: TFile): Promise<void> {
    await this.vault.delete(file);
  }

  // ============= CLIENTES =============

  async getClientes(): Promise<Array<{ file: TFile; data: ClienteData }>> {
    const results = await this.readAllFrontmatter(this.basePath("Clientes"));
    return results
      .filter((r) => r.data.tipo === "cliente")
      .map((r) => ({ file: r.file, data: r.data as unknown as ClienteData }));
  }

  async saveCliente(
    data: Partial<ClienteData>,
    existingFile?: TFile
  ): Promise<TFile> {
    const sanitizedName = (data.nombre || "cliente").replace(/[\\/:*?"<>|]/g, "-");
    const nowStr = now();

    if (existingFile) {
      const updated: Record<string, unknown> = {
        ...data,
        tipo: "cliente",
        updated: nowStr,
      };
      await this.updateFile(existingFile, updated, data.nombre ? `# ${data.nombre}\n` : undefined);
      return existingFile;
    }

    const content = clienteTemplate({
      ...data,
      created: nowStr,
      updated: nowStr,
    } as Partial<ClienteData>);

    return await this.saveNewFile(this.basePath("Clientes"), sanitizedName, content);
  }

  // ============= PROVEEDORES =============

  async getProveedores(): Promise<Array<{ file: TFile; data: ProveedorData }>> {
    const results = await this.readAllFrontmatter(this.basePath("Proveedores"));
    return results
      .filter((r) => r.data.tipo === "proveedor")
      .map((r) => ({ file: r.file, data: r.data as unknown as ProveedorData }));
  }

  async saveProveedor(
    data: Partial<ProveedorData>,
    existingFile?: TFile
  ): Promise<TFile> {
    const sanitizedName = (data.nombre || "proveedor").replace(/[\\/:*?"<>|]/g, "-");
    const nowStr = now();

    if (existingFile) {
      const updated: Record<string, unknown> = {
        ...data,
        tipo: "proveedor",
        updated: nowStr,
      };
      await this.updateFile(existingFile, updated, data.nombre ? `# ${data.nombre}\n` : undefined);
      return existingFile;
    }

    const content = proveedorTemplate({
      ...data,
      created: nowStr,
      updated: nowStr,
    } as Partial<ProveedorData>);

    return await this.saveNewFile(this.basePath("Proveedores"), sanitizedName, content);
  }

  // ============= TRANSACCIONES =============

  async getTransacciones(): Promise<Array<{ file: TFile; data: TransaccionData }>> {
    const folder = this.basePath("Transacciones");
    const files = await this.listFilesRecursive(folder);
    const results: Array<{ file: TFile; data: TransaccionData }> = [];

    for (const file of files) {
      try {
        const content = await this.vault.cachedRead(file);
        const parsed = parseFrontmatterFromContent(content);
        if (parsed.frontmatter.tipo === "transaccion") {
          results.push({ file, data: parsed.frontmatter as unknown as TransaccionData });
        }
      } catch {
        // skip
      }
    }

    return results;
  }

  async saveTransaccion(
    data: Partial<TransaccionData>,
    existingFile?: TFile
  ): Promise<TFile> {
    const nowStr = now();
    const fecha = data.fecha || nowStr.split("T")[0];
    const clase = data.clase || "ingreso";
    const prefix = clase === "ingreso" ? "ingreso" : "egreso";
    const datePart = fecha.replace(/-/g, "").slice(0, 8);
    const sanitizedDesc = (data.descripcion || "transaccion")
      .slice(0, 30)
      .replace(/[\\/:*?"<>|]/g, "-");
    const filename = `${prefix}-${datePart}-${sanitizedDesc}`;

    if (existingFile) {
      const updated: Record<string, unknown> = { ...data, tipo: "transaccion" };
      await this.updateFile(existingFile, updated);
      return existingFile;
    }

    const content = transaccionTemplate({
      ...data,
      created: nowStr,
      updated: nowStr,
    } as Partial<TransaccionData>);

    return await this.saveNewFile(this.basePath("Transacciones"), filename, content);
  }

  // ============= DEUDAS =============

  async getDeudas(): Promise<Array<{ file: TFile; data: DeudaData }>> {
    const results = await this.readAllFrontmatter(this.basePath("Deudas"));
    return results
      .filter((r) => r.data.tipo === "deuda")
      .map((r) => {
        const deuda = { ...(r.data as unknown as DeudaData) };
        if (deuda.estado === "pendiente" && deuda.fecha_vencimiento) {
          const vencimiento = new Date(deuda.fecha_vencimiento + "T00:00:00");
          if (vencimiento < new Date()) {
            deuda.estado = "vencida";
          }
        }
        return { file: r.file, data: deuda };
      });
  }

  async saveDeuda(
    data: Partial<DeudaData>,
    existingFile?: TFile
  ): Promise<TFile> {
    const nowStr = now();
    const clase = data.clase || "a_favor";
    const prefix = clase === "a_favor" ? "cobrar" : "pagar";
    const sanitizedDesc = (data.descripcion || "deuda")
      .slice(0, 30)
      .replace(/[\\/:*?"<>|]/g, "-");
    const filename = `deuda-${prefix}-${sanitizedDesc}`;

    if (existingFile) {
      const updated: Record<string, unknown> = { ...data, tipo: "deuda", updated: nowStr };
      await this.updateFile(existingFile, updated);
      return existingFile;
    }

    const content = deudaTemplate({
      ...data,
      created: nowStr,
      updated: nowStr,
    } as Partial<DeudaData>);

    return await this.saveNewFile(this.basePath("Deudas"), filename, content);
  }

  // ============= INVENTARIO =============

  async getProductos(): Promise<Array<{ file: TFile; data: ProductoData }>> {
    const results = await this.readAllFrontmatter(this.basePath("Inventario"));
    return results
      .filter((r) => r.data.tipo === "producto")
      .map((r) => ({ file: r.file, data: r.data as unknown as ProductoData }));
  }

  async saveProducto(
    data: Partial<ProductoData>,
    existingFile?: TFile
  ): Promise<TFile> {
    const sanitizedName = (data.nombre || "producto").replace(/[\\/:*?"<>|]/g, "-");
    const nowStr = now();

    if (existingFile) {
      const updated: Record<string, unknown> = {
        ...data,
        tipo: "producto",
        updated: nowStr,
      };
      await this.updateFile(existingFile, updated, data.nombre ? `# ${data.nombre}\n` : undefined);
      return existingFile;
    }

    const content = productoTemplate({
      ...data,
      created: nowStr,
      updated: nowStr,
    } as Partial<ProductoData>);

    return await this.saveNewFile(this.basePath("Inventario"), sanitizedName, content);
  }

  async processRecurring(): Promise<void> {
    const transacciones = await this.getTransacciones();
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
      await this.saveTransaccion(newData);
    }
  }
}
