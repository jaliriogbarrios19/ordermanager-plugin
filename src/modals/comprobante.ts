import { Platform, TFile } from "obsidian";
import type { TransaccionData } from "../types";
import type OrderManagerPlugin from "../main";

export interface ComprobanteState {
  data: Partial<TransaccionData>;
  plugin: OrderManagerPlugin;
  app: import("obsidian").App;
}

export function renderComprobante(
  state: ComprobanteState,
  compControl: HTMLElement,
  compPreview: HTMLElement
): void {
  const renderPreview = () => {
    compPreview.empty();
    if (!state.data.comprobante) return;
    const file = state.app.vault.getAbstractFileByPath(state.data.comprobante);
    if (!(file instanceof TFile)) return;
    const resourceUrl = state.app.vault.getResourcePath(file);
    const ext = state.data.comprobante.split(".").pop()?.toLowerCase() || "";

    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) {
      const img = compPreview.createEl("img");
      img.src = resourceUrl;
      img.setCssProps({
        width: "100%",
        maxWidth: "120px",
        maxHeight: "120px",
        height: "auto",
        objectFit: "contain",
        marginTop: "8px",
        borderRadius: "4px",
        border: "1px solid var(--background-modifier-border)",
        cursor: "pointer",
        display: "block",
      });
      img.setAttr("title", "Click para abrir en tamaño completo");
      img.onclick = () => {
        void state.app.workspace.openLinkText(state.data.comprobante!, "", false);
      };
    } else if (ext === "pdf") {
      const pdfBtn = compPreview.createEl("button", { text: "Ver PDF" });
      pdfBtn.addClass("ordermanager-btn-accent");
      pdfBtn.onclick = () => {
        void state.app.workspace.openLinkText(state.data.comprobante!, "", false);
      };
    }
  };

  const pickFile = (useCamera = false) => {
    const fileInput = activeDocument.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip";
    if (useCamera) {
      fileInput.accept = "image/*";
      fileInput.setAttribute("capture", "environment");
    }
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (state.data.comprobante) {
        await state.plugin.dataManager.deleteComprobante(state.data.comprobante);
      }
      const arrayBuffer = await file.arrayBuffer();
      const vaultPath = await state.plugin.dataManager.saveComprobante(arrayBuffer, file.name);
      state.data.comprobante = vaultPath;
      renderInner();
    };
    fileInput.click();
  };

  const renderInner = () => {
    compControl.empty();
    if (state.data.comprobante) {
      const fileName = state.data.comprobante.split("/").pop() || state.data.comprobante;
      const link = compControl.createEl("a", { text: fileName });
      link.setCssProps({color: "var(--interactive-accent)", cursor: "pointer", textDecoration: "underline", marginRight: "8px", fontSize: "0.9em"});
      link.onclick = () => {
        void state.app.workspace.openLinkText(state.data.comprobante!, "", false);
      };

      const changeBtn = compControl.createEl("button", { text: "Cambiar" });
      changeBtn.setCssProps({padding: "4px 8px", fontSize: "0.85em", marginRight: "6px"});
      changeBtn.onclick = () => pickFile();
      if (Platform.isMobile) {
        const cameraBtn = compControl.createEl("button", { text: "📷" });
        cameraBtn.setCssProps({padding: "4px 8px", fontSize: "0.85em", marginRight: "6px"});
        cameraBtn.onclick = () => pickFile(true);
      }

      const removeBtn = compControl.createEl("button", { text: "×" });
      removeBtn.addClass("ordermanager-btn-del");
      removeBtn.onclick = () => { void (async () => {
        await state.plugin.dataManager.deleteComprobante(state.data.comprobante!);
        state.data.comprobante = "";
        renderInner();
      })(); };
    } else {
      const span = compControl.createEl("span", { text: "Sin adjuntar" });
      span.addClass("ordermanager-text-muted");
      span.setCssProps({fontSize: "0.85em", marginRight: "8px"});
      const attachBtn = compControl.createEl("button", { text: "Adjuntar" });
      attachBtn.setCssProps({padding: "4px 8px", fontSize: "0.85em"});
      attachBtn.onclick = () => pickFile();
      if (Platform.isMobile) {
        const cameraBtn = compControl.createEl("button", { text: "📷" });
        cameraBtn.setCssProps({padding: "4px 8px", fontSize: "0.85em", marginLeft: "4px"});
        cameraBtn.onclick = () => pickFile(true);
      }
    }
    renderPreview();
  };

  renderInner();
}
