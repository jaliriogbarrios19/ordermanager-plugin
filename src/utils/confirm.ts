import { App, Modal, Setting } from "obsidian";

class ConfirmModal extends Modal {
  private resolve: (value: boolean) => void;

  constructor(app: App, message: string) {
    super(app);
    this.resolve = () => {};
    this.onResolve = this.onResolve.bind(this);
    this.setMessage(message);
  }

  private onResolve(value: boolean) {
    this.resolve(value);
    this.close();
  }

  private setMessage(msg: string) {
    this.contentEl.empty();
    this.contentEl.addClass("ordermanager-modal");
    this.contentEl.createEl("p", { text: msg, cls: "ordermanager-confirm-msg" });

    const actions = this.contentEl.createDiv({ cls: "ordermanager-form-actions" });
    actions.createEl("button", { text: "Cancelar", cls: "secondary" }).onclick = () =>
      this.onResolve(false);
    actions.createEl("button", { text: "Eliminar", cls: "danger" }).onclick = () =>
      this.onResolve(true);
  }

  open(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      super.open();
    });
  }
}

export function confirmAction(app: App, message: string): Promise<boolean> {
  return new ConfirmModal(app, message).open();
}
