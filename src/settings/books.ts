import { Setting, Notice, TFolder, normalizePath } from "obsidian";
import type OrderManagerPlugin from "../main";
import { t } from "../i18n";
import { confirmAction } from "../utils/confirm";

export function renderBooksSection(
  containerEl: HTMLElement,
  plugin: OrderManagerPlugin
): void {
  new Setting(containerEl).setName(t("books")).setHeading();
  containerEl.createEl("p", {
    text: t("booksDesc"),
    cls: "setting-item-description",
  });

  const renderBooks = async () => {
    const existingWrapper = containerEl.querySelector(".ordermanager-books-list");
    if (existingWrapper) existingWrapper.remove();

    const booksWrapper = containerEl.createDiv({ cls: "ordermanager-books-list" });
    booksWrapper.setCssProps({marginBottom: "12px"});

    if (plugin.settings.libros.length === 0) {
      booksWrapper.createEl("p", {
        text: t("noBookSelectedDesc"),
        cls: "setting-item-description",
      });
    } else {
      for (const libro of plugin.settings.libros) {
        const row = booksWrapper.createDiv();
        row.addClass("ordermanager-book-row");

        const nameSpan = row.createEl("span", { text: libro });
        nameSpan.setCssProps({flex: "1", fontWeight: "500"});

        if (libro === plugin.settings.libroActivo) {
          const badge = row.createEl("span", { text: "✓ Activo" });
          badge.addClass("ordermanager-badge-active");
        } else {
          const setBtn = row.createEl("button", { text: t("selectActive") });
          setBtn.addClass("ordermanager-btn-select");
          setBtn.onclick = async () => {
            plugin.settings.libroActivo = libro;
            await plugin.saveSettings();
            plugin.dataManager.updateSettings(plugin.settings);
            await plugin.dataManager.ensureBaseFolders();
            await renderBooks();
          };
        }

        const renameBtn = row.createEl("button", { text: "✎" });
        renameBtn.addClass("ordermanager-btn-rename");
        renameBtn.onclick = () => {
          nameSpan.setCssProps({display: "none"});
          renameBtn.setCssProps({display: "none"});
          const editRow = row.createDiv();
          editRow.addClass("ordermanager-flex-row");
          const editInput = editRow.createEl("input", { type: "text", value: libro });
          editInput.addClass("ordermanager-input-std");
          const confirmBtn = editRow.createEl("button", { text: "✓" });
          confirmBtn.addClass("ordermanager-btn-accent");
          const cancelBtn = editRow.createEl("button", { text: "×" });
          cancelBtn.addClass("ordermanager-btn-rename");
          const finishRename = async (newName: string) => {
            if (newName && newName !== libro && !plugin.settings.libros.includes(newName)) {
              const oldPath = normalizePath(`${plugin.settings.baseFolder}/${libro}`);
              const newPath = normalizePath(`${plugin.settings.baseFolder}/${newName}`);
              const oldFolder = plugin.app.vault.getAbstractFileByPath(oldPath);
              if (oldFolder instanceof TFolder) {
                try { await plugin.app.vault.rename(oldFolder, newPath); } catch { /* */ }
              }
              const idx = plugin.settings.libros.indexOf(libro);
              plugin.settings.libros[idx] = newName;
              if (plugin.settings.libroActivo === libro) {
                plugin.settings.libroActivo = newName;
              }
              await plugin.saveSettings();
              plugin.dataManager.updateSettings(plugin.settings);
            }
            await renderBooks();
          };
          confirmBtn.onclick = () => { void finishRename(editInput.value.trim()); };
          cancelBtn.onclick = () => { void renderBooks(); };
          editInput.onkeydown = (e) => {
            if (e.key === "Enter") { void finishRename(editInput.value.trim()); }
            if (e.key === "Escape") { void renderBooks(); }
          };
          editInput.select();
          editInput.focus();
        };

        const delBtn = row.createEl("button", { text: "×" });
        delBtn.addClass("ordermanager-btn-del");
        delBtn.onclick = async () => {
          if (!await confirmAction(plugin.app, `"${libro}": ${t("deleteBookConfirm")}`)) return;
          const bookPath = normalizePath(`${plugin.settings.baseFolder}/${libro}`);
          const bookFolder = plugin.app.vault.getAbstractFileByPath(bookPath);
          if (bookFolder instanceof TFolder) {
            try { await plugin.app.fileManager.trashFile(bookFolder); } catch { /* */ }
          }
          plugin.settings.libros = plugin.settings.libros.filter((l) => l !== libro);
          if (plugin.settings.libroActivo === libro) {
            plugin.settings.libroActivo = plugin.settings.libros[0] || "";
          }
          await plugin.saveSettings();
          plugin.dataManager.updateSettings(plugin.settings);
          await renderBooks();
        };
      }
    }
  };

  void renderBooks();

  const createRow = containerEl.createDiv();
  createRow.setCssProps({marginBottom: "12px"});
  createRow.addClass("ordermanager-flex-row");
  const nameInput = createRow.createEl("input", {
    type: "text",
    placeholder: t("newBookName"),
  });
  nameInput.addClass("ordermanager-input-std");
  const createBtn = createRow.createEl("button", { text: t("createBook") });
  createBtn.addClass("ordermanager-btn-accent");
  createBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    if (plugin.settings.libros.includes(name)) {
      new Notice("Ya existe un libro con ese nombre.");
      return;
    }
    plugin.settings.libros.push(name);
    if (!plugin.settings.libroActivo) {
      plugin.settings.libroActivo = name;
    }
    await plugin.saveSettings();
    plugin.dataManager.updateSettings(plugin.settings);
    await plugin.dataManager.ensureBaseFolders();
    await plugin.dataManager.getCategorias();
    await plugin.dataManager.saveCategorias({
      tipo: "categorias",
      categoriasIngreso: [],
      categoriasEgreso: [],
      categoriasProducto: [],
      categoriasCliente: [],
      categoriasProveedor: [],
    });
    nameInput.value = "";
    await renderBooks();
    new Notice(`Libro "${name}" creado.`);
  };

  nameInput.onkeydown = (e) => {
    if (e.key === "Enter") createBtn.click();
  };
}
