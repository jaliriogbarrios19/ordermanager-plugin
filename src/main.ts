import { Plugin, WorkspaceLeaf, FuzzySuggestModal, TFile, Modal, App } from "obsidian";

import { OrderManagerSettingTab } from "./settings";
import { DataManager } from "./data/manager";
import { setLang, type SupportedLang } from "./i18n";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./views/dashboard-view";
import { TransaccionesView, VIEW_TYPE_TRANSACCIONES } from "./views/transacciones-view";
import { ClientesView, VIEW_TYPE_CLIENTES } from "./views/clientes-view";
import { ProveedoresView, VIEW_TYPE_PROVEEDORES } from "./views/proveedores-view";
import { InventarioView, VIEW_TYPE_INVENTARIO } from "./views/inventario-view";
import { DeudasView, VIEW_TYPE_DEUDAS } from "./views/deudas-view";
import { TransaccionModal } from "./modals/transaccion-modal";
import { ClienteModal } from "./modals/cliente-modal";
import { ProveedorModal } from "./modals/proveedor-modal";
import { ProductoModal } from "./modals/producto-modal";
import { DeudaModal } from "./modals/deuda-modal";

import type { OrderManagerSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export default class OrderManagerPlugin extends Plugin {
  settings: OrderManagerSettings;
  dataManager: DataManager;

  async onload() {
    await this.loadSettings();
    setLang((this.settings.language || "es") as SupportedLang);
    this.dataManager = new DataManager(this.app.vault, this.settings);

    await this.dataManager.ensureBaseFolders();

    if (!this.settings.onboardingComplete) {
      new OnboardingModal(this.app, this).open();
    }

    this.addSettingTab(new OrderManagerSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));
    this.registerView(VIEW_TYPE_TRANSACCIONES, (leaf) => new TransaccionesView(leaf, this));
    this.registerView(VIEW_TYPE_CLIENTES, (leaf) => new ClientesView(leaf, this));
    this.registerView(VIEW_TYPE_PROVEEDORES, (leaf) => new ProveedoresView(leaf, this));
    this.registerView(VIEW_TYPE_INVENTARIO, (leaf) => new InventarioView(leaf, this));
    this.registerView(VIEW_TYPE_DEUDAS, (leaf) => new DeudasView(leaf, this));

    this.addRibbonIcon("landmark", "OrderManager", () => {
      this.activateView(VIEW_TYPE_DASHBOARD);
    });

    this.addCommand({
      id: "open-dashboard",
      name: "Abrir dashboard",
      callback: () => this.activateView(VIEW_TYPE_DASHBOARD),
    });

    this.addCommand({
      id: "open-transacciones",
      name: "Abrir transacciones",
      callback: () => this.activateView(VIEW_TYPE_TRANSACCIONES),
    });

    this.addCommand({
      id: "nueva-transaccion",
      name: "Nueva transacción",
      callback: () => {
        new TransaccionModal(this.app, this, async () => {
          const view = this.getExistingView(VIEW_TYPE_TRANSACCIONES);
          if (view instanceof TransaccionesView) await view.refresh();
          const dash = this.getExistingView(VIEW_TYPE_DASHBOARD);
          if (dash instanceof DashboardView) await dash.refresh();
        }).open();
      },
    });

    this.addCommand({
      id: "open-clientes",
      name: "Abrir clientes",
      callback: () => this.activateView(VIEW_TYPE_CLIENTES),
    });

    this.addCommand({
      id: "nuevo-cliente",
      name: "Nuevo cliente",
      callback: () => {
        new ClienteModal(this.app, this, async () => {
          const view = this.getExistingView(VIEW_TYPE_CLIENTES);
          if (view instanceof ClientesView) await view.refresh();
          const dash = this.getExistingView(VIEW_TYPE_DASHBOARD);
          if (dash instanceof DashboardView) await dash.refresh();
        }).open();
      },
    });

    this.addCommand({
      id: "open-proveedores",
      name: "Abrir proveedores",
      callback: () => this.activateView(VIEW_TYPE_PROVEEDORES),
    });

    this.addCommand({
      id: "nuevo-proveedor",
      name: "Nuevo proveedor",
      callback: () => {
        new ProveedorModal(this.app, this, async () => {
          const view = this.getExistingView(VIEW_TYPE_PROVEEDORES);
          if (view instanceof ProveedoresView) await view.refresh();
          const dash = this.getExistingView(VIEW_TYPE_DASHBOARD);
          if (dash instanceof DashboardView) await dash.refresh();
        }).open();
      },
    });

    this.addCommand({
      id: "open-inventario",
      name: "Abrir inventario",
      callback: () => this.activateView(VIEW_TYPE_INVENTARIO),
    });

    this.addCommand({
      id: "nuevo-producto",
      name: "Nuevo producto",
      callback: () => {
        new ProductoModal(this.app, this, async () => {
          const view = this.getExistingView(VIEW_TYPE_INVENTARIO);
          if (view instanceof InventarioView) await view.refresh();
          const dash = this.getExistingView(VIEW_TYPE_DASHBOARD);
          if (dash instanceof DashboardView) await dash.refresh();
        }).open();
      },
    });

    this.addCommand({
      id: "open-deudas",
      name: "Abrir deudas",
      callback: () => this.activateView(VIEW_TYPE_DEUDAS),
    });

    this.addCommand({
      id: "nueva-deuda",
      name: "Nueva deuda",
      callback: () => {
        new DeudaModal(this.app, this, async () => {
          const view = this.getExistingView(VIEW_TYPE_DEUDAS);
          if (view instanceof DeudasView) await view.refresh();
          const dash = this.getExistingView(VIEW_TYPE_DASHBOARD);
          if (dash instanceof DashboardView) await dash.refresh();
        }).open();
      },
    });

    this.addCommand({
      id: "global-search",
      name: "Buscar en todo OrderManager",
      callback: () => {
        new GlobalSearchModal(this.app, this).open();
      },
    });
  }

  async activateView(viewType: string) {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(viewType);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: viewType, active: true });
      }
    }

    if (leaf) workspace.revealLeaf(leaf);
  }

  getExistingView(viewType: string) {
    const leaves = this.app.workspace.getLeavesOfType(viewType);
    if (leaves.length > 0) {
      return leaves[0].view;
    }
    return null;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.dataManager) {
      this.dataManager.updateSettings(this.settings);
    }
  }

  onunload() {}
}

class GlobalSearchModal extends FuzzySuggestModal<{ name: string; type: string; file: TFile }> {
  plugin: OrderManagerPlugin;

  constructor(app: import("obsidian").App, plugin: OrderManagerPlugin) {
    super(app);
    this.plugin = plugin;
  }

  getItems(): { name: string; type: string; file: TFile }[] {
    return (this as any)._items || [];
  }

  getItemText(item: { name: string; type: string; file: TFile }): string {
    return `${item.type}: ${item.name}`;
  }

  async onOpen() {
    super.onOpen();
    const dm = this.plugin.dataManager;
    const [clientes, proveedores, productos, deudas, transacciones] = await Promise.all([
      dm.getClientes(), dm.getProveedores(), dm.getProductos(), dm.getDeudas(), dm.getTransacciones(),
    ]);

    const items: { name: string; type: string; file: TFile }[] = [];
    for (const c of clientes) items.push({ name: c.data.nombre, type: "Cliente", file: c.file });
    for (const p of proveedores) items.push({ name: p.data.nombre, type: "Proveedor", file: p.file });
    for (const p of productos) items.push({ name: p.data.nombre, type: "Producto", file: p.file });
    for (const d of deudas) items.push({ name: d.data.descripcion || "Deuda", type: "Deuda", file: d.file });
    for (const t of transacciones) items.push({ name: t.data.descripcion || "Transacción", type: `Transacción (${t.data.fecha})`, file: t.file });

    (this as any)._items = items;
    (this as any).updateSuggestions();
  }

  onChooseItem(item: { name: string; type: string; file: TFile }): void {
    this.plugin.app.workspace.getLeaf("tab").openFile(item.file);
  }
}

class OnboardingModal extends Modal {
  plugin: OrderManagerPlugin;

  constructor(app: App, plugin: OrderManagerPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Bienvenido a OrderManager" });
    contentEl.createEl("p", { text: "Tu plugin de contabilidad para emprendimientos." });
    contentEl.createEl("h4", { text: "Para empezar:" });
    const list = contentEl.createEl("ol");
    list.createEl("li", { text: "Andá a Settings → OrderManager → Negocios y creá el tuyo (ej: 'Mi Tienda')." });
    list.createEl("li", { text: "En Tasas de cambio, agregá Dólar BCV y USDT, y clickeá Actualizar tasas." });
    list.createEl("li", { text: "Usá el Dashboard para ver tus finanzas y crear transacciones." });
    list.createEl("li", { text: "Ctrl+P → 'OrderManager' para ver todos los comandos." });

    const btn = contentEl.createEl("button", { text: "Entendido", cls: "mod-cta" });
    btn.style.cssText = "margin-top:16px;";
    btn.onclick = async () => {
      this.plugin.settings.onboardingComplete = true;
      await this.plugin.saveSettings();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
