import { COLORS, DEFAULT_LABELS, getKnownLabels, normalizeColor, normalizeLabels, resolveThemeColor } from "./core.js?v=20260517-ui-polish-3";

export class EditorController {
  constructor(elements, callbacks) {
    this.elements = elements;
    this.callbacks = callbacks;
    this.note = null;
    this.saveTimer = null;
    this.bind();
  }

  bind() {
    this.elements.backdrop.addEventListener("click", (event) => {
      if (event.target === this.elements.backdrop) this.close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !this.note || this.elements.backdrop.classList.contains("hidden")) return;
      event.preventDefault();
      this.close();
    });
    this.elements.close.addEventListener("click", () => this.close());
    this.elements.copy.addEventListener("click", () => this.callbacks.copy(this.note));
    this.elements.pin.addEventListener("click", () => this.saveNow({ pinned: !this.note.pinned }));
    this.renderColorPalette();
    this.elements.colorPalette.addEventListener("click", (event) => {
      const button = event.target.closest("[data-editor-color]");
      if (!button) return;
      const nextColor = button.dataset.editorColor;
      this.setColorInputs(nextColor);
      this.applyModalColor(nextColor);
      this.updateColorPalette();
      this.queueSave();
    });
    this.elements.archive.addEventListener("click", async () => {
      await this.flushSave();
      const id = this.note.id;
      const action = this.note.archived ? "unarchive" : "archive";
      this.hide();
      await this.callbacks.action(id, action);
    });
    this.elements.delete.addEventListener("click", async () => {
      await this.flushSave();
      const id = this.note.id;
      this.hide();
      await this.callbacks.action(id, "trash");
    });

    [this.elements.title, this.elements.body, this.elements.color, this.elements.customColor].forEach((input) => {
      input.addEventListener("input", () => this.queueSave());
      input.addEventListener("change", () => {
        this.queueSave();
        this.updateColorPalette();
      });
    });
    this.elements.color.addEventListener("change", () => {
      this.syncCustomColorToCurrent();
      this.applyModalColor(this.currentColor());
    });
    this.elements.customColor.addEventListener("input", () => {
      this.elements.color.value = "custom";
      this.applyModalColor(this.elements.customColor.value);
      this.updateColorPalette();
    });
    this.elements.customColor.addEventListener("change", () => {
      this.elements.color.value = "custom";
      this.applyModalColor(this.elements.customColor.value);
      this.updateColorPalette();
    });
  }

  open(note, allNotes) {
    this.note = note;
    this.elements.title.value = note.title;
    this.elements.body.value = note.body;
    this.setColorInputs(note.color || "default");
    this.applyModalColor(note.color || "default");
    this.updateColorPalette();
    this.renderLabels(allNotes);
    this.updateMeta();
    this.updateButtons();
    this.elements.backdrop.classList.remove("hidden");
    this.resetBodyViewport();
  }

  async close() {
    if (!this.note) return;
    await this.flushSave();
    this.hide();
  }

  hide() {
    this.elements.backdrop.classList.add("hidden");
    this.resetBodyViewport(false);
    this.clearModalColor();
    this.note = null;
  }

  renderLabels(allNotes) {
    const labels = getKnownLabels(allNotes, DEFAULT_LABELS);
    this.elements.labels.innerHTML = labels
      .map((label) => {
        const checked = this.note.labels.includes(label) ? " checked" : "";
        return `<label><input type="checkbox" value="${label}"${checked}> ${label}</label>`;
      })
      .join("");

    this.elements.labels.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => this.queueSave());
    });
  }

  queueSave() {
    if (!this.note) return;
    this.updateMeta();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 350);
  }

  async flushSave() {
    if (!this.note) return;
    clearTimeout(this.saveTimer);
    const patch = this.currentPatch();
    this.applyModalColor(patch.color);
    this.note = await this.callbacks.save(this.note, patch);
    this.setColorInputs(this.note.color || patch.color || "default");
    this.updateColorPalette();
    this.updateButtons();
    this.updateMeta();
  }

  async saveNow(patch) {
    if (!this.note) return;
    this.note = await this.callbacks.save(this.note, patch);
    this.elements.title.value = this.note.title;
    this.elements.body.value = this.note.body;
    this.setColorInputs(this.note.color || "default");
    this.applyModalColor(this.note.color || "default");
    this.updateColorPalette();
    this.updateMeta();
    this.updateButtons();
  }

  currentPatch() {
    const checkedLabels = [...this.elements.labels.querySelectorAll("input:checked")].map((input) => input.value);
    return {
      title: this.elements.title.value,
      body: this.elements.body.value,
      color: this.currentColor(),
      labels: normalizeLabels(checkedLabels),
    };
  }

  currentColor() {
    if (this.elements.color.value === "custom") {
      return normalizeColor(this.elements.customColor.value);
    }
    return normalizeColor(this.elements.color.value);
  }

  applyModalColor(color) {
    if (!this.elements.modal) return;
    const lightColor = resolveThemeColor(color, "light");
    const darkColor = resolveThemeColor(color, "dark");
    if (lightColor) this.elements.modal.style.setProperty("--editor-bg-light", lightColor);
    else this.elements.modal.style.removeProperty("--editor-bg-light");
    if (darkColor) this.elements.modal.style.setProperty("--editor-bg-dark", darkColor);
    else this.elements.modal.style.removeProperty("--editor-bg-dark");
  }

  clearModalColor() {
    if (!this.elements.modal) return;
    this.elements.modal.style.removeProperty("--editor-bg-light");
    this.elements.modal.style.removeProperty("--editor-bg-dark");
  }

  setColorInputs(color) {
    const normalized = normalizeColor(color);
    const resolvedLightColor = resolveThemeColor(normalized, "light") || "#ffffff";
    this.elements.customColor.value = resolvedLightColor;
    if (COLORS.includes(normalized)) {
      this.elements.color.value = normalized;
      return;
    }
    this.elements.color.value = "custom";
    this.elements.customColor.value = normalized;
  }

  syncCustomColorToCurrent() {
    this.elements.customColor.value = resolveThemeColor(this.currentColor(), "light") || "#ffffff";
  }

  renderColorPalette() {
    if (!this.elements.colorPalette) return;
    this.elements.colorPalette.innerHTML = COLORS
      .map((color) => {
        const lightColor = resolveThemeColor(color, "light") || "var(--surface)";
        const darkColor = resolveThemeColor(color, "dark") || "var(--surface)";
        return `<button class="color-dot editor-color-dot note-${color}" type="button" data-editor-color="${color}" style="--note-bg-light:${lightColor};--note-bg-dark:${darkColor};" aria-label="Kolor"></button>`;
      })
      .join("");
  }

  updateColorPalette() {
    if (!this.elements.colorPalette) return;
    const color = this.elements.color.value;
    this.elements.colorPalette.querySelectorAll("[data-editor-color]").forEach((button) => {
      button.classList.toggle("active", button.dataset.editorColor === color);
    });
    this.elements.customColor.classList.toggle("active", color === "custom");
  }

  updateMeta() {
    const bodyLength = this.elements.body.value.length;
    this.elements.charCount.textContent = `${bodyLength.toLocaleString("pl-PL")} znaków`;
    if (this.note) {
      const created = formatDate(this.note.createdAt);
      const updated = formatDate(this.note.updatedAt);
      this.elements.dateInfo.textContent = `Utworzono: ${created} · Zmieniono: ${updated}`;
    }
  }

  updateButtons() {
    if (!this.note) return;
    this.elements.pin.textContent = this.note.pinned ? "Odepnij" : "Przypnij";
    this.elements.archive.textContent = this.note.archived ? "Przywróć z archiwum" : "Archiwizuj";
  }

  resetBodyViewport(keepFocus = true) {
    const body = this.elements.body;
    if (!body) return;
    const reset = (force = false) => {
      if (!force && body.scrollTop > 8) return;
      body.scrollTop = 0;
      if (typeof body.setSelectionRange === "function") {
        body.setSelectionRange(0, 0);
      }
      if (keepFocus) {
        body.focus({ preventScroll: true });
      }
      body.scrollTop = 0;
    };
    reset(true);
    requestAnimationFrame(() => reset(false));
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
