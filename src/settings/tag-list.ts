export function buildTagList(
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
