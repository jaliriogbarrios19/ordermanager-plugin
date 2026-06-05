export function buildTagList(
  containerEl: HTMLElement,
  items: string[],
  onSave: (values: string[]) => Promise<void>
): void {
  const wrapper = containerEl.createDiv({ cls: "ordermanager-tag-list" });
  wrapper.setCssProps({display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px"});

  const renderTags = () => {
    wrapper.empty();
    for (const item of items) {
      const tag = wrapper.createSpan({ cls: "ordermanager-tag" });
      tag.addClass("ordermanager-tag-pill");
      tag.setCssProps({gap: "4px", padding: "4px 10px", borderRadius: "12px"});

      tag.createSpan({ text: item });

      const removeBtn = tag.createSpan({ text: "×" });
      removeBtn.setCssProps({cursor: "pointer", fontWeight: "bold"});
      removeBtn.addClass("ordermanager-text-muted");
      removeBtn.setCssProps({marginLeft: "2px"});
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
  inputRow.setCssProps({display: "flex", gap: "8px", marginBottom: "8px"});

  const input = inputRow.createEl("input", { type: "text" });
  input.placeholder = "Nuevo valor...";
  input.addClass("ordermanager-input-std");

  const addBtn = inputRow.createEl("button", { text: "Agregar" });
  addBtn.addClass("ordermanager-btn-accent");

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
