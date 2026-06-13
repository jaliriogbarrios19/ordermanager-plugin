import { TFile } from "obsidian";
import { parseFrontmatterFromContent } from "./parser";
import { clienteTemplate, proveedorTemplate, transaccionTemplate, deudaTemplate, productoTemplate } from "./templates";
import type {
  ClienteData,
  ProveedorData,
  TransaccionData,
  ProductoEnTransaccion,
  DeudaData,
  ProductoData,
  InsumoReceta,
} from "../types";
import { now } from "../utils/date";
import { CategoriaManager } from "./categoria-manager";
import { processRecurring as processRecurringImpl } from "./recurring";

export class DataManager extends CategoriaManager {

  // ============= CLIENTES =============

  async getClientes(): Promise<Array<{ file: TFile; data: ClienteData }>> {
    return this.getEntities<ClienteData>("Clientes", "cliente");
  }

  async saveCliente(
    data: Partial<ClienteData>,
    existingFile?: TFile
  ): Promise<TFile> {
    return this.saveSimpleEntity<ClienteData>(
      data, "cliente", "Clientes", clienteTemplate, existingFile
    );
  }

  // ============= PROVEEDORES =============

  async getProveedores(): Promise<Array<{ file: TFile; data: ProveedorData }>> {
    return this.getEntities<ProveedorData>("Proveedores", "proveedor");
  }

  async saveProveedor(
    data: Partial<ProveedorData>,
    existingFile?: TFile
  ): Promise<TFile> {
    return this.saveSimpleEntity<ProveedorData>(
      data, "proveedor", "Proveedores", proveedorTemplate, existingFile
    );
  }

  // ============= TRANSACCIONES =============

  async getTransacciones(): Promise<Array<{ file: TFile; data: TransaccionData }>> {
    if (!this.settings.libroActivo) return [];
    const folder = this.basePath("Transacciones");
    const files = await this.listFilesRecursive(folder);
    const results: Array<{ file: TFile; data: TransaccionData }> = [];

    for (const file of files) {
      try {
        const content = await this.vault.cachedRead(file);
        const parsed = parseFrontmatterFromContent(content).frontmatter;
        if (parsed.tipo === "transaccion") {
          const data = parsed as unknown as TransaccionData;
          if (typeof data.productos === "string") {
            try { data.productos = JSON.parse(data.productos as string) as ProductoEnTransaccion[]; } catch { data.productos = []; }
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

    if (data.tipo_operacion !== "pedido") {
      await this.actualizarInventario(data);
    }

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
        { ...match.data, stock: nuevoStock },
        match.file
      );
    }
  }

  // ============= DEUDAS =============

  async getDeudas(): Promise<Array<{ file: TFile; data: DeudaData }>> {
    if (!this.settings.libroActivo) return [];
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
    if (!this.settings.libroActivo) return [];
    const results = await this.readAllFrontmatter(this.basePath("Inventario"));
    return results
      .filter((r) => r.data.tipo === "producto")
      .map((r) => {
        const data = r.data as unknown as ProductoData;
        if (typeof data.receta === "string") {
          try { data.receta = JSON.parse(data.receta as string) as InsumoReceta[]; } catch { data.receta = []; }
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

  // ============= RECURRING =============

  async processRecurring(): Promise<void> {
    await processRecurringImpl(this);
  }
}
