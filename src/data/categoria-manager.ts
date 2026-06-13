import { TFile, normalizePath } from "obsidian";
import { stringifyYaml } from "./parser";
import type { CategoriasData } from "../types";
import { DEFAULT_CATEGORIAS } from "../types";
import { now } from "../utils/date";
import { EntityCrud } from "./entity-crud";

export class CategoriaManager extends EntityCrud {

  async getCategorias(): Promise<CategoriasData> {
    if (!this.settings.libroActivo) {
      return {
        tipo: "categorias",
        categoriasIngreso: [...DEFAULT_CATEGORIAS.categoriasIngreso],
        categoriasEgreso: [...DEFAULT_CATEGORIAS.categoriasEgreso],
        categoriasProducto: [...DEFAULT_CATEGORIAS.categoriasProducto],
        categoriasCliente: [...DEFAULT_CATEGORIAS.categoriasCliente],
        categoriasProveedor: [...DEFAULT_CATEGORIAS.categoriasProveedor],
      };
    }
    const catPath = normalizePath(`${this.basePath("")}/_categorias.md`);
    const file = this.vault.getAbstractFileByPath(catPath);
    if (file instanceof TFile) {
      try {
        const data = await this.readFrontmatter(file);
        if (data.tipo === "categorias") {
          const parseArr = (field: unknown): string[] => {
            if (Array.isArray(field)) return field as string[];
            if (typeof field === "string") {
              try { const parsed: unknown = JSON.parse(field); if (Array.isArray(parsed)) return parsed as string[]; } catch { /* */ }
              if (field.includes(",")) return field.split(",");
            }
            return [];
          };
          return {
            tipo: "categorias",
            categoriasIngreso: parseArr(data.categoriasIngreso).length > 0 ? parseArr(data.categoriasIngreso) : [...DEFAULT_CATEGORIAS.categoriasIngreso],
            categoriasEgreso: parseArr(data.categoriasEgreso).length > 0 ? parseArr(data.categoriasEgreso) : [...DEFAULT_CATEGORIAS.categoriasEgreso],
            categoriasProducto: parseArr(data.categoriasProducto).length > 0 ? parseArr(data.categoriasProducto) : [...DEFAULT_CATEGORIAS.categoriasProducto],
            categoriasCliente: parseArr(data.categoriasCliente).length > 0 ? parseArr(data.categoriasCliente) : [...DEFAULT_CATEGORIAS.categoriasCliente],
            categoriasProveedor: parseArr(data.categoriasProveedor).length > 0 ? parseArr(data.categoriasProveedor) : [...DEFAULT_CATEGORIAS.categoriasProveedor],
          };
        }
      } catch { /* corrupt file, fallback */ }
    }
    return {
      tipo: "categorias" as const,
      categoriasIngreso: [...DEFAULT_CATEGORIAS.categoriasIngreso],
      categoriasEgreso: [...DEFAULT_CATEGORIAS.categoriasEgreso],
      categoriasProducto: [...DEFAULT_CATEGORIAS.categoriasProducto],
      categoriasCliente: [...DEFAULT_CATEGORIAS.categoriasCliente],
      categoriasProveedor: [...DEFAULT_CATEGORIAS.categoriasProveedor],
    };
  }

  async saveCategorias(data: CategoriasData): Promise<void> {
    try {
      const base = normalizePath(`${this.settings.baseFolder}/${this.settings.libroActivo}`);
      await this.ensureFolder(base);
      const catPath = normalizePath(`${base}/_categorias.md`);
      const safe: Record<string, unknown> = {
        tipo: "categorias",
        categoriasIngreso: JSON.stringify([...data.categoriasIngreso]),
        categoriasEgreso: JSON.stringify([...data.categoriasEgreso]),
        categoriasProducto: JSON.stringify([...data.categoriasProducto]),
        categoriasCliente: JSON.stringify([...data.categoriasCliente]),
        categoriasProveedor: JSON.stringify([...data.categoriasProveedor]),
        updated: now(),
      };
      const content = `---\n${stringifyYaml(safe)}\n---\n# Categorías\n`;
      const file = this.vault.getAbstractFileByPath(catPath);
      if (file instanceof TFile) {
        await this.vault.modify(file, content);
      } else {
        await this.vault.create(catPath, content);
      }
    } catch (e) {
      console.error("OrderManager: saveCategorias failed", e);
    }
  }

  async migrateExistingBooks(): Promise<void> {
    for (const libro of this.settings.libros) {
      const catPath = normalizePath(`${this.settings.baseFolder}/${libro}/_categorias.md`);
      if (!(await this.vault.adapter.exists(catPath))) {
        const prevLibro = this.settings.libroActivo;
        this.settings.libroActivo = libro;
        try {
          await this.ensureBaseFolders();
          await this.saveCategorias({ ...DEFAULT_CATEGORIAS });
        } finally {
          this.settings.libroActivo = prevLibro;
        }
      }
    }
    if (this.settings.libros.length > 0 && !this.settings.libroActivo) {
      this.settings.libroActivo = this.settings.libros[0];
    }
  }
}
