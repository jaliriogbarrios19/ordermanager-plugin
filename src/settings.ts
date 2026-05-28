import { App, PluginSettingTab, Setting, DropdownComponent, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type OrderManagerPlugin from "./main";
import type { OrderManagerSettings } from "./types";
import { FIAT_CURRENCIES, CRYPTO_CURRENCIES, MONEDA_SOURCES } from "./types";
import { LANG_LABELS, type SupportedLang } from "./i18n";
import { t } from "./i18n";
import { fetchExchangeRates, rebaseRates } from "./utils/exchange";

export class OrderManagerSettingTab extends PluginSettingTab {
  plugin: OrderManagerPlugin;

  constructor(app: App, plugin: OrderManagerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "OrderManager" });

    new Setting(containerEl)
      .setName("Carpeta base")
      .setDesc("Carpeta donde se almacenan los datos del plugin")
      .addText((text) =>
        text
          .setPlaceholder("OrderManager")
          .setValue(this.plugin.settings.baseFolder)
          .onChange(async (value) => {
            this.plugin.settings.baseFolder = value || "OrderManager";
            await this.plugin.saveSettings();
            this.plugin.dataManager.updateSettings(this.plugin.settings);
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
        for (const s of MONEDA_SOURCES) dd.addOption(s.code, `${s.label} (${s.code})`);
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
        if (displayFactor === 0) {
          displayFactor = this.plugin.settings.bcvPrice || 1;
        }
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
          const codeSpan = item.createSpan({
            text: ` (${s.code})`,
          });
          codeSpan.style.cssText = "color:var(--text-muted);font-size:0.8em;";
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

    containerEl.createEl("h3", { text: t("businesses") });
    containerEl.createEl("p", {
      text: t("businessesDesc"),
      cls: "setting-item-description",
    });

    this.buildTagList(
      containerEl,
      this.plugin.settings.negocios,
      async (values) => {
        if (values.length === 0) return;
        this.plugin.settings.negocios = values;
        if (!values.includes(this.plugin.settings.negocioActivo)) {
          this.plugin.settings.negocioActivo = values[0];
        }
        await this.plugin.saveSettings();
        this.plugin.dataManager.updateSettings(this.plugin.settings);
      }
    );

    const dupRow = containerEl.createDiv();
    dupRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:12px;";
    const dupSelect = dupRow.createEl("select");
    for (const n of this.plugin.settings.negocios) {
      dupSelect.createEl("option", { text: n });
    }
    const dupBtn = dupRow.createEl("button", { text: "Duplicar negocio" });
    dupBtn.style.cssText =
      "padding:6px 14px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;";
    dupBtn.onclick = async () => {
      const source = dupSelect.value;
      const target = `${source} (copia)`;
      if (this.plugin.settings.negocios.includes(target)) {
        new Notice("Ya existe un negocio con ese nombre.");
        return;
      }
      this.plugin.settings.negocios.push(target);
      await this.plugin.saveSettings();
      const srcPath = normalizePath(`${this.plugin.settings.baseFolder}/${source}`);
      const dstPath = normalizePath(`${this.plugin.settings.baseFolder}/${target}`);
      const srcFolder = this.plugin.app.vault.getAbstractFileByPath(srcPath);
      if (srcFolder instanceof TFolder) {
        await this.copyFolder(srcFolder, dstPath);
      }
      new Notice(`Negocio "${target}" duplicado.`);
      this.display();
    };

    containerEl.createEl("h3", { text: t("incomeCategories") });
    this.buildTagList(
      containerEl,
      this.plugin.settings.categoriasIngreso,
      async (values) => {
        this.plugin.settings.categoriasIngreso = values;
        await this.plugin.saveSettings();
      }
    );

    containerEl.createEl("h3", { text: t("expenseCategories") });
    this.buildTagList(
      containerEl,
      this.plugin.settings.categoriasEgreso,
      async (values) => {
        this.plugin.settings.categoriasEgreso = values;
        await this.plugin.saveSettings();
      }
    );

    containerEl.createEl("h3", { text: t("paymentMethods") });
    this.buildTagList(
      containerEl,
      this.plugin.settings.mediosPago,
      async (values) => {
        this.plugin.settings.mediosPago = values;
        await this.plugin.saveSettings();
      }
    );

    containerEl.createEl("h3", { text: t("productCategories") });
    this.buildTagList(
      containerEl,
      this.plugin.settings.categoriasProducto,
      async (values) => {
        this.plugin.settings.categoriasProducto = values;
        await this.plugin.saveSettings();
      }
    );

    containerEl.createEl("h3", { text: t("clientCategories") });
    this.buildTagList(
      containerEl,
      this.plugin.settings.categoriasCliente,
      async (values) => {
        this.plugin.settings.categoriasCliente = values;
        await this.plugin.saveSettings();
      }
    );
  }

  private buildTagList(
    containerEl: HTMLElement,
    items: string[],
    onSave: (values: string[]) => Promise<void>
  ): void {
    const wrapper = containerEl.createDiv({ cls: "ordermanager-tag-list" });
    wrapper.style.display = "flex";
    wrapper.style.flexWrap = "wrap";
    wrapper.style.gap = "6px";
    wrapper.style.marginBottom = "12px";

    const renderTags = () => {
      wrapper.empty();
      for (const item of items) {
        const tag = wrapper.createSpan({ cls: "ordermanager-tag" });
        tag.style.cssText =
          "display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--background-secondary);border-radius:12px;font-size:0.85em;";

        const label = tag.createSpan({ text: item });

        const removeBtn = tag.createSpan({ text: "×" });
        removeBtn.style.cssText =
          "cursor:pointer;font-weight:bold;color:var(--text-muted);margin-left:2px;";
        removeBtn.onclick = async () => {
          const filtered = items.filter((i) => i !== item);
          if (filtered.length !== items.length) {
            await onSave(filtered);
            items.length = 0;
            items.push(...filtered);
            renderTags();
          }
        };

        wrapper.appendChild(tag);
      }
    };

    renderTags();

    const inputRow = containerEl.createDiv();
    inputRow.style.display = "flex";
    inputRow.style.gap = "8px";
    inputRow.style.marginBottom = "8px";

    const input = inputRow.createEl("input", { type: "text" });
    input.placeholder = "Nuevo valor...";
    input.style.cssText =
      "flex:1;padding:6px 10px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);color:var(--text-normal);";

    const addBtn = inputRow.createEl("button", { text: "Agregar" });
    addBtn.style.cssText =
      "padding:6px 14px;border:none;border-radius:4px;background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-weight:500;";

    addBtn.onclick = async () => {
      const value = input.value.trim();
      if (value && !items.includes(value)) {
        items.push(value);
        await onSave([...items]);
        renderTags();
        input.value = "";
      }
    };

    input.onkeydown = (e) => {
      if (e.key === "Enter") addBtn.click();
    };
  }

  private async copyFolder(src: TFolder, dstPath: string): Promise<void> {
    await this.plugin.app.vault.createFolder(dstPath);
    for (const child of src.children) {
      if (child instanceof TFile) {
        const content = await this.plugin.app.vault.read(child);
        await this.plugin.app.vault.create(`${dstPath}/${child.name}`, content);
      } else if (child instanceof TFolder) {
        await this.copyFolder(child, `${dstPath}/${child.name}`);
      }
    }
  }
}
