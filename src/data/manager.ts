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
    return normalizePath(`${this.settings.baseFolder}/${this.settings.libroActivo}/${subfolder}`);
  }

  async ensureFolder(path: string): Promise<TFolder> {
    const normalized = normalizePath(path);
    const existing = this.vault.getAbstractFileByPath(normalized);
    if (existing && existing instanceof TFolder) return existing;

    const existsOnDisk = await this.vault.adapter.exists(normalized);
    if (existsOnDisk) {
      const retry = this.vault.getAbstractFileByPath(normalized);
      if (retry && retry instanceof TFolder) return retry;
    }

    try {
      return await this.vault.createFolder(normalized);
    } catch {
      const retry = this.vault.getAbstractFileByPath(normalized);
      if (retry && retry instanceof TFolder) return retry;
      if (await this.vault.adapter.exists(normalized)) {
        const again = this.vault.getAbstractFileByPath(normalized);
        if (again && again instanceof TFolder) return again;
      }
      throw new Error(`No se pudo crear/verificar la carpeta: ${normalized}`);
    }
  }

  async ensureBaseFolders(): Promise<void> {
    const base = normalizePath(`${this.settings.baseFolder}/${this.settings.libroActivo}`);
    await this.ensureFolder(base);
    await this.ensureFolder(`${base}/Clientes`);
    await this.ensureFolder(`${base}/Proveedores`);
    await this.ensureFolder(`${base}/Transacciones`);
    await this.ensureFolder(`${base}/Deudas`);
    await this.ensureFolder(`${base}/Inventario`);
    await this.ensureFolder(`${base}/Comprobantes`);
  }

  async discoverBooks(): Promise<{ books: string[]; actualBasePath: string }> {
    const configuredPath = normalizePath(this.settings.baseFolder);
    let matchedPath = configuredPath;

    const dataFolders = ["Clientes", "Proveedores", "Transacciones", "Deudas", "Inventario"];

    const collectFromIndex = (folder: TFolder): string[] =>
      folder.children
        .filter((c): c is TFolder => c instanceof TFolder)
        .filter((sub) =>
          sub.children.some(
            (c) => c instanceof TFolder && dataFolders.includes(c.name)
          )
        )
        .map((f) => f.name);

    const collectFromAdapter = async (basePath: string): Promise<string[]> => {
      const books: string[] = [];
      try {
        const listing = await this.vault.adapter.list(basePath);
        for (const folderPath of listing.folders) {
          const name = (folderPath.startsWith(basePath + "/")
            ? folderPath.slice(basePath.length + 1)
            : folderPath).split("/")[0];
          if (!name || books.includes(name)) continue;
          try {
            const subListing = await this.vault.adapter.list(`${basePath}/${name}`);
            const hasData = dataFolders.some((df) =>
              subListing.folders.some((f) => f === `${basePath}/${name}/${df}`)
            );
            if (hasData) books.push(name);
          } catch {
            /* skip */
          }
        }
      } catch {
        /* basePath not readable */
      }
      return books;
    };

    const mergeAndDedup = (a: string[], b: string[]): string[] =>
      [...new Set([...a, ...b])];

    const baseRaw = this.vault.getAbstractFileByPath(configuredPath);
    if (baseRaw instanceof TFolder) {
      const indexed = collectFromIndex(baseRaw);
      const fromDisk = await collectFromAdapter(configuredPath);
      return { books: mergeAndDedup(indexed, fromDisk), actualBasePath: configuredPath };
    }

    const root = this.vault.getRoot();
    if (root) {
      for (const child of root.children) {
        if (child instanceof TFolder && child.name.toLowerCase() === configuredPath.toLowerCase()) {
          matchedPath = child.path;
          const indexed = collectFromIndex(child);
          const fromDisk = await collectFromAdapter(matchedPath);
          return { books: mergeAndDedup(indexed, fromDisk), actualBasePath: matchedPath };
        }
      }
    }

    const exists = await this.vault.adapter.exists(configuredPath);
    if (exists) {
      const fromDisk = await collectFromAdapter(configuredPath);
      return { books: fromDisk, actualBasePath: matchedPath };
    }

    return { books: [], actualBasePath: configuredPath };
  }

  private comprobantesPath(): string {
    return normalizePath(`${this.settings.baseFolder}/${this.settings.libroActivo}/Comprobantes`);
  }

  async saveComprobante(arrayBuffer: ArrayBuffer, originalName: string): Promise<string> {
    await this.ensureFolder(this.comprobantesPath());
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const sanitizedName = originalName.replace(/[\\/:*?"<>|]/g, "-");
    const filename = `${ts}-${sanitizedName}`;
    let finalPath = normalizePath(`${this.comprobantesPath()}/${filename}`);
    let counter = 1;
    while (this.vault.getAbstractFileByPath(finalPath)) {
      const dotIdx = filename.lastIndexOf(".");
      const base = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
      const ext = dotIdx > 0 ? filename.substring(dotIdx) : "";
      finalPath = normalizePath(`${this.comprobantesPath()}/${base}-${counter}${ext}`);
      counter++;
    }
    await this.vault.createBinary(finalPath, arrayBuffer);
    return finalPath;
  }

  async deleteComprobante(comprobantePath: string): Promise<void> {
    if (!comprobantePath) return;
    const file = this.vault.getAbstractFileByPath(comprobantePath);
    if (file instanceof TFile) {
      await this.vault.delete(file);
    } else if (await this.vault.adapter.exists(comprobantePath)) {
      await this.vault.adapter.remove(comprobantePath);
    }
  }

  async deleteTransaccion(file: TFile): Promise<void> {
    try {
      const data = await this.readFrontmatter(file);
      if (data.comprobante && typeof data.comprobante === "string") {
        await this.deleteComprobante(data.comprobante);
      }
    } catch {
      /* no comprobante or unreadable */
    }
    await this.vault.delete(file);
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

    try {
      return await this.vault.create(finalPath, content);
    } catch (e) {
      const retry = this.vault.getAbstractFileByPath(finalPath);
      if (retry instanceof TFile) return retry;
      throw e;
    }
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
          const data = parsed.frontmatter as unknown as TransaccionData;
          if (typeof data.productos === "string") {
            try { data.productos = JSON.parse(data.productos as string); } catch { data.productos = []; }
          }
          if (!data.productos) data.productos = [];
          results.push({ file, data });
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

    let result: TFile;

    if (existingFile) {
      const updated: Record<string, unknown> = { ...data, tipo: "transaccion" };
      if (Array.isArray(updated.productos)) {
        updated.productos = JSON.stringify(updated.productos);
      }
      await this.updateFile(existingFile, updated);
      result = existingFile;
    } else {
      const content = transaccionTemplate({
        ...data,
        created: nowStr,
        updated: nowStr,
      } as Partial<TransaccionData>);

      result = await this.saveNewFile(this.basePath("Transacciones"), filename, content);
    }

    await this.actualizarInventario(data);

    return result;
  }

  async actualizarInventario(data: Partial<TransaccionData>): Promise<void> {
    const productos = data.productos;
    if (!productos || productos.length === 0) return;

    const inventario = await this.getProductos();
    const esVenta = data.clase === "ingreso";

    for (const item of productos) {
      const match = inventario.find(
        (p) => p.data.nombre.toLowerCase() === item.nombre.toLowerCase()
      );
      if (!match) continue;

      const nuevoStock = esVenta
        ? (match.data.stock || 0) - item.cantidad
        : (match.data.stock || 0) + item.cantidad;

      await this.saveProducto(
        { ...match.data, stock: Math.max(0, nuevoStock) },
        match.file
      );
    }
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

    let result: TFile;

    if (existingFile) {
      const updated: Record<string, unknown> = { ...data, tipo: "deuda", updated: nowStr };
      await this.updateFile(existingFile, updated);
      result = existingFile;
    } else {
      const content = deudaTemplate({
        ...data,
        created: nowStr,
        updated: nowStr,
      } as Partial<DeudaData>);

      result = await this.saveNewFile(this.basePath("Deudas"), filename, content);
    }

    if (
      data.deuda_tipo === "producto" &&
      data.registrar_en_inventario &&
      data.clase === "en_contra" &&
      data.producto &&
      (data.cantidad_producto || 0) > 0
    ) {
      const productos = await this.getProductos();
      const match = productos.find((p) => p.data.nombre === data.producto);
      if (match) {
        const updatedProduct = {
          ...match.data,
          stock: (match.data.stock || 0) + (data.cantidad_producto || 0),
        };
        await this.saveProducto(updatedProduct, match.file);
      }
    }

    return result;
  }

  // ============= INVENTARIO =============

  async getProductos(): Promise<Array<{ file: TFile; data: ProductoData }>> {
    const results = await this.readAllFrontmatter(this.basePath("Inventario"));
    return results
      .filter((r) => r.data.tipo === "producto")
      .map((r) => {
        const data = r.data as unknown as ProductoData;
        if (typeof data.receta === "string") {
          try { data.receta = JSON.parse(data.receta as string); } catch { data.receta = []; }
        }
        if (!data.receta) data.receta = [];
        return { file: r.file, data };
      });
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
      if (Array.isArray(updated.receta)) {
        updated.receta = JSON.stringify(updated.receta);
      }
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
