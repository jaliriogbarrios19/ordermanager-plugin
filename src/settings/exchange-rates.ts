import { Setting, DropdownComponent, Notice } from "obsidian";
import type OrderManagerPlugin from "../main";
import { MONEDA_SOURCES } from "../types";
import { fetchExchangeRates, rebaseRates } from "../utils/exchange";

export function renderExchangeRatesSection(
  containerEl: HTMLElement,
  plugin: OrderManagerPlugin,
  buildTagPanel: () => void
): void {
  new Setting(containerEl).setName("Tasas de cambio").setHeading();

  new Setting(containerEl)
    .setName("Moneda de referencia")
    .setDesc("Todos los balances se convierten a esta moneda")
    .addDropdown((dd: DropdownComponent) => {
      for (const s of MONEDA_SOURCES) dd.addOption(s.code, s.label);
      dd.setValue(plugin.settings.tasaReferencia || "USD");
      dd.onChange(async (v) => {
        plugin.settings.tasaReferencia = v;
        if (!plugin.settings.tasasCambio[v]) {
          const similar = v === "VES" ? plugin.settings.tasasCambio["VES_BCV"] : undefined;
          plugin.settings.tasasCambio[v] = similar || plugin.settings.tasasCambio[v] || 1;
        }
        plugin.settings.tasasCambio = rebaseRates(plugin.settings.tasasCambio, v);
        await plugin.saveSettings();
        buildTagPanel();
      });
    });

  containerEl.createEl("p", {
    text: "Mis monedas:",
    cls: "setting-item-description",
  });

  const tagsWrapper = containerEl.createDiv();
  tagsWrapper.addClass("ordermanager-toolbar");

  const buildInnerTagPanel = () => {
    tagsWrapper.empty();
    const rates = { ...plugin.settings.tasasCambio };
    for (const [code, valor] of Object.entries(rates)) {
      if (code === plugin.settings.tasaReferencia || code.startsWith("_")) continue;
      const source = MONEDA_SOURCES.find((s) => s.code === code);
      const label = source?.label || code;
      let displayFactor = source?.displayFactor ?? 1;
      const displayVal = valor * displayFactor;

      const tag = tagsWrapper.createDiv();
      tag.addClass("ordermanager-tag-pill");

      const labelSpan = tag.createSpan({ text: label });
      labelSpan.setCssProps({fontWeight: "500"});

      const valInput = tag.createEl("input", { type: "number" });
      valInput.addClass("ordermanager-table-input");
      valInput.setCssProps({width: "100px", padding: "2px 6px"});
      valInput.step = "0.00000001";
      valInput.value = String(displayVal);
      valInput.onchange = async () => {
        const newDisplay = parseFloat(valInput.value) || 0;
        plugin.settings.tasasCambio[code] = displayFactor > 0 ? newDisplay / displayFactor : newDisplay;
        await plugin.saveSettings();
      };

      const delBtn = tag.createEl("button", { text: "×" });
      delBtn.addClass("ordermanager-btn-del");
      delBtn.onclick = async () => {
        delete plugin.settings.tasasCambio[code];
        await plugin.saveSettings();
        buildInnerTagPanel();
      };
    }
  };
  buildInnerTagPanel();

  if (Object.keys(plugin.settings.tasasCambio).length > 1) {
    const cleanBtn = containerEl.createEl("button", { text: "Limpiar todas" });
    cleanBtn.addClass("ordermanager-btn-select");
    cleanBtn.onclick = async () => {
      plugin.settings.tasasCambio = { USD: 1 };
      plugin.settings.bcvPrice = 0;
      plugin.settings.fechaTasas = "";
      await plugin.saveSettings();
      buildInnerTagPanel();
    };
  }

  const addRow = containerEl.createDiv();
  addRow.setCssProps({marginBottom: "8px"});
  addRow.addClass("ordermanager-flex-row");
  const comboWrapper = addRow.createDiv();
  comboWrapper.setCssProps({position: "relative", flex: "1"});
  const comboInput = comboWrapper.createEl("input", {
    type: "text",
    placeholder: "Buscar o escribir moneda...",
  });
  comboInput.addClass("ordermanager-input-std");
  const comboList = comboWrapper.createDiv();
  comboList.setCssProps({
    display: "none",
    position: "absolute",
    top: "100%",
    left: "0",
    right: "0",
    maxHeight: "180px",
    overflowY: "auto",
    background: "var(--background-primary)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "4px",
    zIndex: "10",
  });

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
      noRes.addClass("ordermanager-text-muted");
      noRes.setCssProps({padding: "8px", fontSize: "0.8em"});
    } else {
      for (const s of filtered) {
        const item = comboList.createDiv();
        item.setCssProps({padding: "6px 10px", cursor: "pointer", fontSize: "0.85em"});
        item.createSpan({ text: s.label });
        item.onmousedown = (e: MouseEvent) => {
          e.preventDefault();
          if (!plugin.settings.tasasCambio[s.code]) {
            plugin.settings.tasasCambio[s.code] = 1;
            void plugin.saveSettings();
            buildInnerTagPanel();
          }
        comboInput.value = "";
          comboList.setCssProps({display: "none"});
        };
      }
    }
    if (q.length >= 2) {
      const customItem = comboList.createDiv();
      customItem.setCssProps({padding: "6px 10px", cursor: "pointer", fontSize: "0.85em", borderTop: "1px solid var(--background-modifier-border)"});
      customItem.createSpan({ text: `Agregar "${q.toUpperCase()}" (personalizada)` });
      customItem.onmousedown = (e: MouseEvent) => {
        e.preventDefault();
        const code = q.toUpperCase();
        if (!plugin.settings.tasasCambio[code]) {
          plugin.settings.tasasCambio[code] = 1;
          void plugin.saveSettings();
          buildInnerTagPanel();
        }
        comboInput.value = "";
        comboList.setCssProps({display: "none"});
      };
    }
    comboList.setCssProps({display: filtered.length > 0 || q.length >= 2 ? "block" : "none"});
  };

  comboInput.onfocus = () => filterCombo();
  comboInput.oninput = () => filterCombo();
  comboInput.onblur = () => {
    window.setTimeout(() => { comboList.setCssProps({display: "none"}); }, 150);
  };

  const fetchBtn = addRow.createEl("button", { text: "Actualizar tasas" });
  fetchBtn.addClass("ordermanager-btn-accent");
  fetchBtn.onclick = async () => {
    fetchBtn.textContent = "Consultando...";
    fetchBtn.disabled = true;
    try {
      const monedas = Object.keys(plugin.settings.tasasCambio).filter((k) => !k.startsWith("_") && k !== "USD");
      if (monedas.length === 0) {
        new Notice("Agregá monedas primero (ej: Dólar BCV, USDT)");
      } else {
        const rates = await fetchExchangeRates(["USD", ...monedas]);
        const bcvRaw = rates["_BCV_PRICE"];
        if (bcvRaw && bcvRaw > 0) {
          plugin.settings.bcvPrice = bcvRaw;
        }
        const rebased = rebaseRates(rates, plugin.settings.tasaReferencia || "USD");
        let updated = 0;
        for (const code of monedas) {
          if (rebased[code] !== undefined) {
            plugin.settings.tasasCambio[code] = rebased[code];
            updated++;
          }
        }
        if (updated > 0) {
          plugin.settings.fechaTasas = new Date().toISOString();
          const todayKey = new Date().toISOString().split("T")[0];
          if (!plugin.settings.tasasHistoricas) plugin.settings.tasasHistoricas = {};
          plugin.settings.tasasHistoricas[todayKey] = { ...plugin.settings.tasasCambio };
          await plugin.saveSettings();
          buildInnerTagPanel();
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

  if (plugin.settings.fechaTasas) {
    containerEl.createEl("p", {
      text: `Última actualización: ${new Date(plugin.settings.fechaTasas).toLocaleString()}`,
      cls: "setting-item-description",
    });
  }
}
