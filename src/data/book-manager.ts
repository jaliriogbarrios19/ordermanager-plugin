import { App, TFile, TFolder, normalizePath } from "obsidian";
import { parseFrontmatterFromContent, buildMarkdownNote } from "./parser";
import type { OrderManagerSettings } from "../types";
import { now } from "../utils/date";

export class BookManager {
  protected app: App;
  protected settings: OrderManagerSettings;

  protected get vault(): App["vault"] {
    return this.app.vault;
  }

  constructor(app: App, settings: OrderManagerSettings) {
    this.app = app;
    this.settings = settings;
  }

  updateSettings(settings: OrderManagerSettings) {
    this.settings = settings;
  }

  protected basePath(subfolder: string): string {
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

    const markerPath = normalizePath(`${this.settings.baseFolder}/.ordermanager`);
    if (!(await this.vault.adapter.exists(markerPath))) {
      try { await this.vault.adapter.write(markerPath, "ordermanager"); } catch { /* ok */ }
    }
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
            : folderPath
          ).split("/")[0];
          if (!name || books.includes(name)) continue;
          const subListing = await this.vault.adapter.list(`${basePath}/${name}`);
          const hasData = dataFolders.some((df) =>
            subListing.folders.some((f) => f.endsWith(`/${df}`) || f === df)
          );
          if (hasData) books.push(name);
        }
      } catch { /* */ }
      return books;
    };

    const tryBasePath = async (basePath: string): Promise<string[]> => {
      const fromIndex: string[] = [];
      const baseRaw = this.vault.getAbstractFileByPath(basePath);
      if (baseRaw instanceof TFolder) {
        fromIndex.push(...collectFromIndex(baseRaw));
      }
      const fromAdapter = await collectFromAdapter(basePath);
      return [...new Set([...fromIndex, ...fromAdapter])];
    };

    let books = await tryBasePath(configuredPath);

    if (books.length === 0) {
      const root = this.vault.getRoot();
      if (root) {
        for (const child of root.children) {
          if (child instanceof TFolder && child.name.toLowerCase() === configuredPath.toLowerCase()) {
            matchedPath = normalizePath(child.name);
            books = collectFromIndex(child);
            break;
          }
        }
      }
    }

    if (books.length === 0) {
      const exists = await this.vault.adapter.exists(configuredPath);
      if (exists) {
        const markerPath = `${configuredPath}/.ordermanager`;
        const markerResult = await this.vault.adapter.exists(markerPath);
        if (markerResult) return { books: [], actualBasePath: matchedPath };

        const root = this.vault.getRoot();
        if (!root) return { books: [], actualBasePath: matchedPath };

        const candidates: string[] = [];
        for (const entry of root.children) {
          if (!(entry instanceof TFolder)) continue;
          const markerPath2 = `${entry.path}/.ordermanager`;
          if (await this.vault.adapter.exists(markerPath2)) {
            candidates.push(entry.path);
          }
        }

        if (candidates.length > 0) {
          matchedPath = candidates[0];
          books = await collectFromAdapter(matchedPath);
        }
      }
    }

    if (books.length === 0) {
      const listing = await this.vault.adapter.list("");
      for (const folderPath of listing.folders) {
        const name = folderPath.split("/").pop() || "";
        if (!name) continue;
        const subListing = await this.vault.adapter.list(folderPath);
        if (dataFolders.some((df) => subListing.folders.includes(`${matchedPath}/${name}/${df}`))) {
          if (!books.includes(name)) books.push(name);
        }
      }
    }

    if (books.length > 0) {
      matchedPath = normalizePath(this.settings.baseFolder);
    }

    return { books, actualBasePath: matchedPath };
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
      await this.app.fileManager.trashFile(file);
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
    await this.app.fileManager.trashFile(file);
  }

  protected async readFrontmatter(file: TFile): Promise<Record<string, unknown>> {
    const content = await this.vault.cachedRead(file);
    return parseFrontmatterFromContent(content).frontmatter;
  }

  protected async readAllFrontmatter(folder: string): Promise<Array<{ file: TFile; data: Record<string, unknown> }>> {
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

  protected async listFilesRecursive(folder: string): Promise<TFile[]> {
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

  protected async saveNewFile(folder: string, filename: string, content: string): Promise<TFile> {
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

  protected async updateFile(file: TFile, frontmatter: Record<string, unknown>, body?: string): Promise<void> {
    frontmatter.updated = now();
    const content = buildMarkdownNote(frontmatter, body || "");
    await this.vault.modify(file, content);
  }

  async deleteFile(file: TFile): Promise<void> {
    await this.app.fileManager.trashFile(file);
  }
}
