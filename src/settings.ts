import { App, PluginSettingTab, Setting, DropdownComponent, Notice, TFolder } from "obsidian";
import type OrderManagerPlugin from "./main";
import { FIAT_CURRENCIES, CRYPTO_CURRENCIES } from "./types";
import { LANG_LABELS, t } from "./i18n";
import { buildTagList } from "./settings/tag-list";
import { renderExchangeRatesSection } from "./settings/exchange-rates";
import { renderBooksSection } from "./settings/books";

export class OrderManagerSettingTab extends PluginSettingTab {
  plugin: OrderManagerPlugin;
  private displayGen = 0;

  constructor(app: App, plugin: OrderManagerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.render();
  }

  private render(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("OrderManager").setHeading();

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
            this.render();
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

    const rebuildTagPanel = () => { this.render(); };
    renderExchangeRatesSection(containerEl, this.plugin, rebuildTagPanel);
    renderBooksSection(containerEl, this.plugin);

    new Setting(containerEl).setName(t("paymentMethods")).setHeading();
    buildTagList(
      containerEl,
      this.plugin.settings.mediosPago,
      async (values) => {
        this.plugin.settings.mediosPago = values;
        await this.plugin.saveSettings();
      }
    );

    const gen = ++this.displayGen;
    void (async () => {
      const cats = await this.plugin.dataManager.getCategorias();
      if (gen !== this.displayGen) return;

      new Setting(containerEl).setName(t("incomeCategories")).setHeading();
      buildTagList(containerEl, cats.categoriasIngreso, async (values) => {
        cats.categoriasIngreso = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });

      new Setting(containerEl).setName(t("expenseCategories")).setHeading();
      buildTagList(containerEl, cats.categoriasEgreso, async (values) => {
        cats.categoriasEgreso = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });

      new Setting(containerEl).setName(t("productCategories")).setHeading();
      buildTagList(containerEl, cats.categoriasProducto, async (values) => {
        cats.categoriasProducto = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });

      new Setting(containerEl).setName(t("clientCategories")).setHeading();
      buildTagList(containerEl, cats.categoriasCliente, async (values) => {
        cats.categoriasCliente = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });

      new Setting(containerEl).setName("Categorías de proveedores").setHeading();
      buildTagList(containerEl, cats.categoriasProveedor, async (values) => {
        cats.categoriasProveedor = values;
        await this.plugin.dataManager.saveCategorias(cats);
      });
    })();
  }

}
