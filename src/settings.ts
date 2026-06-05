import { App, PluginSettingTab, Setting, DropdownComponent, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type OrderManagerPlugin from "./main";
import type { OrderManagerSettings } from "./types";
import { FIAT_CURRENCIES, CRYPTO_CURRENCIES, MONEDA_SOURCES, DEFAULT_CATEGORIAS } from "./types";
import { LANG_LABELS, type SupportedLang } from "./i18n";
import { t } from "./i18n";
import { fetchExchangeRates, rebaseRates } from "./utils/exchange";
import { buildTagList } from "./settings/tag-list";

export class OrderManagerSettingTab extends PluginSettingTab {
  plugin: OrderManagerPlugin;
  private displayGen = 0;

  constructor(app: App, plugin: OrderManagerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "OrderManager" });

    const rootFolders = this.plugin.app.vault.getRoot().children
      .filter((c): c is TFolder => c instanceof TFolder)
      .map((f) => f.name)
      .sort();

    const baseFolderSetting = new Setting(containerEl)
      .setName("Carpeta base")
      .setDesc("Carpeta donde se almacenan los datos del plugin");

    const currentBase = this.plugin.settings.baseFolder;
    const matchesRoot = rootFolders.some((f) => f.toLowerCase() === currentBase.toLowerCase());

    if (rootFolders.length > 0) {
      baseFolderSetting.addDropdown((dd: DropdownComponent) => {
        if (!matchesRoot && currentBase) {
          dd.addOption(currentBase, `${currentBase} (actual)`);
        }
        dd.addOption("", "— Raíz del vault —");
        for (const f of rootFolders) {
          dd.addOption(f, f);
        }
        const selected = matchesRoot
          ? rootFolders.find((f) => f.toLowerCase() === currentBase.toLowerCase()) || ""
          : currentBase;
        dd.setValue(selected);
        dd.onChange(async (v) => {
          if (v && v !== currentBase) {
            this.plugin.settings.baseFolder = v;
            await this.plugin.saveSettings();
            this.plugin.dataManager.updateSettings(this.plugin.settings);
          }
        });
      });
    } else {
      baseFolderSetting.addText((text) =>
        text
          .setPlaceholder("OrderManager")
          .setValue(currentBase)
          .onChange(async (value) => {
            this.plugin.settings.baseFolder = value || "OrderManager";
            await this.plugin.saveSettings();
            this.plugin.dataManager.updateSettings(this.plugin.settings);
          })
      );
    }

    baseFolderSetting.addButton((btn) =>
      btn
        .setButtonText("Detectar")
        .setTooltip("Buscar carpetas OrderManager existentes en el vault")
        .onClick(async () => {
          const { books: discovered, actualBasePath } = await this.plugin.dataManager.discoverBooks();
          if (discovered.length > 0) {
            this.plugin.settings.baseFolder = actualBasePath;
            this.plugin.settings.libros = discovered;
            this.plugin.settings.libroActivo = discovered[0];
            await this.plugin.saveSettings();
            this.plugin.dataManager.updateSettings(this.plugin.settings);
            new Notice(`${discovered.length} libro(s) detectado(s) en "${actualBasePath}".`);
            this.display();
          } else {
            new Notice(`No se encontraron datos en "${actualBasePath}".`);
          }
        })
    );

    new Setting(containerEl)
      .setName(t("defaultCurrency"))
      .setDesc(t("defaultCurrencyDesc"))
      .addDropdown((dd: DropdownComponent) => {
        dd.addOption("", "— Fiat —");
        for (const c of FIAT_CURRENCIES) dd.addOption(c, c);
        dd.addOption("", "— Crypto —");
        for (const c of CRYPTO_CURRENCIES) dd.addOption(c, c);
        dd.setValue(this.plugin.settings.defaultCurrency);
        dd.onChange(async (v) => {
          if (v && v !== "— Fiat —" && v !== "— Crypto —") {
            this.plugin.settings.defaultCurrency = v;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName(t("language"))
      .setDesc(t("languageDesc"))
      .addDropdown((dd: DropdownComponent) => {
        for (const [key, label] of Object.entries(LANG_LABELS)) {
          dd.addOption(key, label);
        }
        dd.setValue(this.plugin.settings.language || "es");
        dd.onChange(async (v) => {
          this.plugin.settings.language = v;
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl("h3", { text: "Tasas de cambio" });

    new Setting(containerEl)
      .setName("Moneda de referencia")
      .setDesc("Todos los balances se convierten a esta moneda")
      .addDropdown((dd: DropdownComponent) => {
        for (const s of MONEDA_SOURCES) dd.addOption(s.code, s.label);
        dd.setValue(this.plugin.settings.tasaReferencia || "USD");
        dd.onChange(async (v) => {
          this.plugin.settings.tasaReferencia = v;
          if (!this.plugin.settings.tasasCambio[v]) {
            const similar = v === "VES" ? this.plugin.settings.tasasCambio["VES_BCV"] : undefined;
            this.plugin.settings.tasasCambio[v] = similar || this.plugin.settings.tasasCambio[v] || 1;
          }
          this.plugin.settings.tasasCambio = rebaseRates(this.plugin.settings.tasasCambio, v);
          await this.plugin.saveSettings();
          buildTagPanel();
        });
      });

    containerEl.createEl("p", {
      text: "Mis monedas:",
      cls: "setting-item-description",
    });

    const tagsWrapper = containerEl.createDiv();
    tagsWrapper.style.cssText =
      "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;";

    const buildTagPanel = () => {
      tagsWrapper.empty();
      const rates = { ...this.plugin.settings.tasasCambio };
      for (const [code, valor] of Object.entries(rates)) {
        if (code === this.plugin.settings.tasaReferencia || code.startsWith("_")) continue;
        const source = MONEDA_SOURCES.find((s) => s.code === code);
        const label = source?.label || code;
        let displayFactor = source?.displayFactor ?? 1;
        const displayVal = valor * displayFactor;

        const tag = tagsWrapper.createDiv();
        tag.style.cssText =
          "display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:8px;font-size:0.85em;";

        const labelSpan = tag.createSpan({ text: label });
        labelSpan.style.cssText = "font-weight:500;";

        const valInput = tag.createEl("input", { type: "number" });
        valInput.style.cssText =
          "width:100px;padding:2px 6px;border:1px solid var(--background-modifier-border);border-radius:3px;font-size:0.85em;background:var(--background-primary);color:var(--text-normal);";
        valInput.step = "0.00000001";
        valInput.value = String(displayVal);
        valInput.onchange = async () => {
          const newDisplay = parseFloat(valInput.value) || 0;
          this.plugin.settings.tasasCambio[code] = displayFactor > 0 ? newDisplay / displayFactor : newDisplay;
          await this.plugin.saveSettings();
        };

        const delBtn = tag.createEl("button", { text: "×" });
        delBtn.style.cssText =
          "padding:1px 7px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;font-size:0.9em;line-height:1;";
        delBtn.onclick = async () => {
          delete this.plugin.settings.tasasCambio[code];
          await this.plugin.saveSettings();
          buildTagPanel();
        };
      }
    };
    buildTagPanel();

    if (Object.keys(this.plugin.settings.tasasCambio).length > 1) {
      const cleanBtn = containerEl.createEl("button", { text: "Limpiar todas" });
      cleanBtn.style.cssText =
        "padding:4px 12px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-secondary);color:var(--text-muted);cursor:pointer;font-size:0.8em;margin-bottom:8px;";
      cleanBtn.onclick = async () => {
        this.plugin.settings.tasasCambio = { USD: 1 };
        this.plugin.settings.bcvPrice = 0;
        this.plugin.settings.fechaTasas = "";
        await this.plugin.saveSettings();
        buildTagPanel();
      };
    }

    const addRow = containerEl.createDiv();
    addRow.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center;";
    const comboWrapper = addRow.createDiv();
    comboWrapper.style.cssText = "position:relative;flex:1;";
    const comboInput = comboWrapper.createEl("input", {
      type: "text",
      placeholder: "Buscar o escribir moneda...",
    });
    comboInput.style.cssText =
      "width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid var(--background-modifier-border);border-radius:4px;font-size:0.85em;";
    const comboList = comboWrapper.createDiv();
    comboList.style.cssText =
      "display:none;position:absolute;top:100%;left:0;right:0;max-height:180px;overflow-y:auto;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:4px;z-index:10;";

    const filterCombo = () => {
      comboList.empty();
      const q = comboInput.value.toLowerCase();
      const filtered = MONEDA_SOURCES.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q)
      ).slice(0, 15);
      if (filtered.length === 0) {
        const noRes = comboList.createDiv({ text: "Escribí un código (ej: ARS)" });
        noRes.style.cssText = "padding:8px;font-size:0.8em;color:var(--text-muted);";
      } else {
        for (const s of filtered) {
          const item = comboList.createDiv();
          item.style.cssText =
            "padding:6px 10px;cursor:pointer;font-size:0.85em;";
          item.createSpan({ text: s.label });
          item.onmousedown = (e: MouseEvent) => {
            e.preventDefault();
            if (!this.plugin.settings.tasasCambio[s.code]) {
              this.plugin.settings.tasasCambio[s.code] = 1;
              this.plugin.saveSettings();
              buildTagPanel();
            }
            comboInput.value = "";
            comboList.style.display = "none";
          };
        }
      }
      if (q.length >= 2) {
        const customItem = comboList.createDiv();
        customItem.style.cssText =
          "padding:6px 10px;cursor:pointer;font-size:0.85em;border-top:1px solid var(--background-modifier-border);";
        customItem.createSpan({ text: `Agregar "${q.toUpperCase()}" (personalizada)` });
        customItem.onmousedown = (e: MouseEvent) => {
          e.preventDefault();
          const code = q.toUpperCase();
          if (!this.plugin.settings.tasasCambio[code]) {
            this.plugin.settings.tasasCambio[code] = 1;
            this.plugin.saveSettings();
            buildTagPanel();
          }
          comboInput.value = "";
          comboList.style.display = "none";
        };
      }
      comboList.style.display = filtered.length > 0 || q.length >= 2 ? "block" : "none";
    };

    comboInput.onfocus = () => filterCombo();
    comboInput.oninput = () => filterCombo();
    comboInput.onblur = () => {
      setTimeout(() => { comboList.style.display = "none"; }, 150);
    };

    const fetchBtn = addRow.createEl("button", { text: "Actualizar tasas" });
    fetchBtn.style.cssText =
      "padding:6px 14px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-weight:600;white-space:nowrap;";
    fetchBtn.onclick = async () => {
      fetchBtn.textContent = "Consultando...";
      fetchBtn.disabled = true;
      try {
        const monedas = Object.keys(this.plugin.settings.tasasCambio).filter((k) => !k.startsWith("_") && k !== "USD");
        if (monedas.length === 0) {
          new Notice("Agregá monedas primero (ej: Dólar BCV, USDT)");
        } else {
          const rates = await fetchExchangeRates(["USD", ...monedas]);
          const bcvRaw = rates["_BCV_PRICE"];
          if (bcvRaw && bcvRaw > 0) {
            this.plugin.settings.bcvPrice = bcvRaw;
          }
          const rebased = rebaseRates(rates, this.plugin.settings.tasaReferencia || "USD");
          let updated = 0;
          for (const code of monedas) {
            if (rebased[code] !== undefined) {
              this.plugin.settings.tasasCambio[code] = rebased[code];
              updated++;
            }
          }
          if (updated > 0) {
            this.plugin.settings.fechaTasas = new Date().toISOString();
            await this.plugin.saveSettings();
            buildTagPanel();
            new Notice(`${updated} tasa(s) actualizada(s)`);
          } else {
            new Notice("No se pudieron obtener tasas. Verificá tu conexión.");
          }
        }
      } catch {
        new Notice("Error al consultar tasas.");
      }
      fetchBtn.textContent = "Actualizar tasas";
      fetchBtn.disabled = false;
    };

    if (this.plugin.settings.fechaTasas) {
      containerEl.createEl("p", {
        text: `Última actualización: ${new Date(this.plugin.settings.fechaTasas).toLocaleString()}`,
        cls: "setting-item-description",
      });
    }

    containerEl.createEl("h3", { text: t("books") });
    containerEl.createEl("p", {
      text: t("booksDesc"),
      cls: "setting-item-description",
    });

    const renderBooks = async () => {
      const existingWrapper = containerEl.querySelector(".ordermanager-books-list");
      if (existingWrapper) existingWrapper.remove();

      const booksWrapper = containerEl.createDiv({ cls: "ordermanager-books-list" });
      booksWrapper.style.cssText = "margin-bottom:12px;";

      if (this.plugin.settings.libros.length === 0) {
        booksWrapper.createEl("p", {
          text: t("noBookSelectedDesc"),
          cls: "setting-item-description",
        });
      } else {
        for (const libro of this.plugin.settings.libros) {
          const row = booksWrapper.createDiv();
          row.style.cssText =
            "display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;background:var(--background-secondary);border-radius:6px;";

          const nameSpan = row.createEl("span", { text: libro });
          nameSpan.style.cssText = "flex:1;font-weight:500;";

          if (libro === this.plugin.settings.libroActivo) {
            const badge = row.createEl("span", { text: "✓ Activo" });
            badge.style.cssText =
              "font-size:0.75em;padding:2px 8px;background:var(--interactive-accent);color:var(--text-on-accent);border-radius:10px;";
          } else {
            const setBtn = row.createEl("button", { text: t("selectActive") });
            setBtn.style.cssText =
              "padding:3px 10px;font-size:0.8em;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);cursor:pointer;";
            setBtn.onclick = async () => {
              this.plugin.settings.libroActivo = libro;
              await this.plugin.saveSettings();
              this.plugin.dataManager.updateSettings(this.plugin.settings);
              await this.plugin.dataManager.ensureBaseFolders();
              await renderBooks();
            };
          }

          const renameBtn = row.createEl("button", { text: "✎" });
          renameBtn.style.cssText =
            "padding:3px 8px;font-size:0.8em;border:none;border-radius:4px;background:transparent;cursor:pointer;color:var(--text-muted);";
          renameBtn.onclick = () => {
            nameSpan.style.display = "none";
            renameBtn.style.display = "none";
            const editRow = row.createDiv();
            editRow.style.cssText = "display:flex;gap:4px;flex:1;";
            const editInput = editRow.createEl("input", { type: "text", value: libro });
            editInput.style.cssText =
              "flex:1;padding:2px 6px;border:1px solid var(--interactive-accent);border-radius:3px;font-size:0.85em;background:var(--background-primary);color:var(--text-normal);";
            const confirmBtn = editRow.createEl("button", { text: "✓" });
            confirmBtn.style.cssText =
              "padding:2px 8px;border:none;border-radius:3px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:0.85em;";
            const cancelBtn = editRow.createEl("button", { text: "×" });
            cancelBtn.style.cssText =
              "padding:2px 8px;border:none;border-radius:3px;background:transparent;color:var(--text-muted);cursor:pointer;font-size:0.85em;";
            const finishRename = async (newName: string) => {
              if (newName && newName !== libro && !this.plugin.settings.libros.includes(newName)) {
                const oldPath = normalizePath(`${this.plugin.settings.baseFolder}/${libro}`);
                const newPath = normalizePath(`${this.plugin.settings.baseFolder}/${newName}`);
                const oldFolder = this.plugin.app.vault.getAbstractFileByPath(oldPath);
                if (oldFolder instanceof TFolder) {
                  try { await this.plugin.app.vault.rename(oldFolder, newPath); } catch { /* */ }
                }
                const idx = this.plugin.settings.libros.indexOf(libro);
                this.plugin.settings.libros[idx] = newName;
                if (this.plugin.settings.libroActivo === libro) {
                  this.plugin.settings.libroActivo = newName;
                }
                await this.plugin.saveSettings();
                this.plugin.dataManager.updateSettings(this.plugin.settings);
              }
              await renderBooks();
            };
            confirmBtn.onclick = () => finishRename(editInput.value.trim());
            cancelBtn.onclick = () => renderBooks();
            editInput.onkeydown = (e) => {
              if (e.key === "Enter") finishRename(editInput.value.trim());
              if (e.key === "Escape") renderBooks();
            };
            editInput.select();
            editInput.focus();
          };

          const delBtn = row.createEl("button", { text: "×" });
          delBtn.style.cssText =
            "padding:3px 8px;border:none;border-radius:4px;background:var(--color-red);color:#fff;cursor:pointer;font-size:0.8em;";
          delBtn.onclick = async () => {
            if (!confirm(`"${libro}": ${t("deleteBookConfirm")}`)) return;
            const bookPath = normalizePath(`${this.plugin.settings.baseFolder}/${libro}`);
            const bookFolder = this.plugin.app.vault.getAbstractFileByPath(bookPath);
            if (bookFolder instanceof TFolder) {
              try { await this.plugin.app.vault.delete(bookFolder, true); } catch { /* */ }
            }
            this.plugin.settings.libros = this.plugin.settings.libros.filter((l) => l !== libro);
            if (this.plugin.settings.libroActivo === libro) {
              this.plugin.settings.libroActivo = this.plugin.settings.libros[0] || "";
            }
            await this.plugin.saveSettings();
            this.plugin.dataManager.updateSettings(this.plugin.settings);
            await renderBooks();
          };
        }
      }
    };

    renderBooks();

    const createRow = containerEl.createDiv();
    createRow.style.cssText = "display:flex;gap:8px;margin-bottom:12px;";
    const nameInput = createRow.createEl("input", {
      type: "text",
      placeholder: t("newBookName"),
    });
    nameInput.style.cssText =
      "flex:1;padding:6px 10px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);color:var(--text-normal);";
    const createBtn = createRow.createEl("button", { text: t("createBook") });
    createBtn.style.cssText =
      "padding:6px 14px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-weight:500;white-space:nowrap;";
    createBtn.onclick = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      if (this.plugin.settings.libros.includes(name)) {
        new Notice("Ya existe un libro con ese nombre.");
        return;
      }
      this.plugin.settings.libros.push(name);
      if (!this.plugin.settings.libroActivo) {
        this.plugin.settings.libroActivo = name;
      }
      await this.plugin.saveSettings();
      this.plugin.dataManager.updateSettings(this.plugin.settings);
      await this.plugin.dataManager.ensureBaseFolders();
      await this.plugin.dataManager.getCategorias();
      await this.plugin.dataManager.saveCategorias({ ...DEFAULT_CATEGORIAS });
      nameInput.value = "";
      await renderBooks();
      new Notice(`Libro "${name}" creado.`);
    };

    nameInput.onkeydown = (e) => {
      if (e.key === "Enter") createBtn.click();
    };

    containerEl.createEl("h3", { text: t("paymentMethods") });
    buildTagList(
      containerEl,
      this.plugin.settings.mediosPago,
      async (values) => {
        this.plugin.settings.mediosPago = values;
        await this.plugin.saveSettings();
      }
    );

    const gen = ++this.displayGen;
    (async () => {
      const cats = await this.plugin.dataManager.getCategorias();
      if (gen !== this.displayGen) return;

      containerEl.createEl("h3", { text: t("incomeCategories") });
      buildTagList(containerEl, cats.categoriasIngreso, async (values) => {
        cats.categoriasIngreso = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });

      containerEl.createEl("h3", { text: t("expenseCategories") });
      buildTagList(containerEl, cats.categoriasEgreso, async (values) => {
        cats.categoriasEgreso = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });

      containerEl.createEl("h3", { text: t("productCategories") });
      buildTagList(containerEl, cats.categoriasProducto, async (values) => {
        cats.categoriasProducto = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });

      containerEl.createEl("h3", { text: t("clientCategories") });
      buildTagList(containerEl, cats.categoriasCliente, async (values) => {
        cats.categoriasCliente = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });

      containerEl.createEl("h3", { text: "Categorías de proveedores" });
      buildTagList(containerEl, cats.categoriasProveedor, async (values) => {
        cats.categoriasProveedor = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });
    })();
  }

}
