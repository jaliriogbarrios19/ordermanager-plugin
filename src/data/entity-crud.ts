import { TFile } from "obsidian";
import { BookManager } from "./book-manager";
import { now } from "../utils/date";

export interface SimpleEntityData {
  tipo: string;
  nombre?: string;
  created?: string;
  updated?: string;
}

export class EntityCrud extends BookManager {

  protected async getEntities<T extends object>(
    folder: string,
    tipo: string
  ): Promise<Array<{ file: TFile; data: T }>> {
    if (!this.settings.libroActivo) return [];
    const results = await this.readAllFrontmatter(this.basePath(folder));
    return results
      .filter((r) => r.data.tipo === tipo)
      .map((r) => ({ file: r.file, data: r.data as unknown as T }));
  }

  protected async saveSimpleEntity<T extends object>(
    data: Partial<T>,
    tipo: string,
    folder: string,
    template: (d: Partial<T>) => string,
    existingFile?: TFile
  ): Promise<TFile> {
    const sanitizedName = ((data as Record<string, unknown>).nombre as string || tipo).replace(/[\\/:*?"<>|]/g, "-");
    const nowStr = now();

    if (existingFile) {
      const updated: Record<string, unknown> = {
        ...(data as Record<string, unknown>),
        tipo,
        updated: nowStr,
      };
      await this.updateFile(existingFile, updated, (data as Record<string, unknown>).nombre ? `# ${(data as Record<string, unknown>).nombre}\n` : undefined);
      return existingFile;
    }

    const content = template({
      ...data,
      created: nowStr,
      updated: nowStr,
    } as Partial<T>);

    return await this.saveNewFile(this.basePath(folder), sanitizedName, content);
  }
}
