import {
  COLORS,
  computeMasonryLayout,
  DEFAULT_LABELS,
  getCardMenuActions,
  getInlineCardActions,
  getKnownLabels,
  previewText,
  resolveNoteColor,
  resolveThemeColor,
  splitPinned,
} from "./core.js?v=20260517-ui-polish-3";
import { attachSwipe } from "./swipe.js?v=20260517-ui-polish-3";

export class NotesRenderer {
  constructor(elements, handlers) {
    this.elements = elements;
    this.handlers = handlers;
    this.layoutFrame = 0;
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.scheduleLayout())
      : null;

    [this.elements.pinnedGrid, this.elements.notesGrid].forEach((grid) => this.resizeObserver?.observe(grid));
    window.addEventListener("resize", () => this.scheduleLayout());
  }

  render({ notes, filtered, view, label }) {
    this.renderLabels(notes, view, label);
    this.renderQuickLabels(notes);
    this.renderQuickColors();

    const { pinned, others } = splitPinned(filtered);
    const showPinned = view !== "trash" && pinned.length > 0;

    this.elements.pinnedHeading.hidden = !showPinned;
    this.elements.othersHeading.hidden = !showPinned || others.length === 0;
    this.elements.pinnedGrid.innerHTML = "";
    this.elements.notesGrid.innerHTML = "";

    if (showPinned) {
      pinned.forEach((note) => this.elements.pinnedGrid.append(this.noteCard(note, view)));
    }
    others.forEach((note) => this.elements.notesGrid.append(this.noteCard(note, view)));

    this.scheduleLayout();

    const empty = filtered.length === 0;
    this.elements.emptyState.classList.toggle("hidden", !empty);
  }

  scheduleLayout() {
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = requestAnimationFrame(() => {
        this.applyMasonry(this.elements.pinnedGrid);
        this.applyMasonry(this.elements.notesGrid);
      });
    });
  }

  applyMasonry(grid) {
    if (!grid) return;
    const cards = [...grid.querySelectorAll(".note-card")];
    if (cards.length === 0) {
      grid.style.height = "0";
      return;
    }

    const styles = getComputedStyle(document.querySelector(".app-shell") || document.documentElement);
    const minColumnWidth = parseFloat(styles.getPropertyValue("--note-column-width")) || 220;
    const gridStyles = getComputedStyle(grid);
    const gap = parseFloat(gridStyles.getPropertyValue("--notes-gap")) || 14;
    const containerWidth = grid.clientWidth;
    const itemHeights = cards.map((card) => card.offsetHeight);
    const layout = computeMasonryLayout({ itemHeights, containerWidth, minColumnWidth, gap });

    grid.style.height = `${layout.height}px`;
    cards.forEach((card, index) => {
      const position = layout.positions[index];
      if (!position) return;
      card.style.left = `${position.x}px`;
      card.style.top = `${position.y}px`;
      card.style.width = `${position.width}px`;
    });
  }

  renderLabels(notes, view, activeLabel) {
    const labels = getKnownLabels(notes, DEFAULT_LABELS);
    this.elements.labelList.innerHTML = labels
      .map((label) => {
        const active = view === "label" && activeLabel === label ? " active" : "";
        return `<button class="nav-item${active}" data-label="${escapeAttr(label)}">${sidebarIconForLabel(label)}<span>${escapeHtml(label)}</span></button>`;
      })
      .join("");
  }

  renderQuickLabels(notes) {
    const labels = getKnownLabels(notes, DEFAULT_LABELS);
    const current = this.elements.quickLabel.value;
    this.elements.quickLabel.innerHTML = `<option value="">Bez etykiety</option>${labels
      .map((label) => `<option value="${escapeAttr(label)}">${escapeHtml(label)}</option>`)
      .join("")}`;
    if (this.elements.quickLabelMenu) {
      this.elements.quickLabelMenu.innerHTML = `<button type="button" data-quick-label="">Bez etykiety</button>${labels
        .map((label) => `<button type="button" data-quick-label="${escapeAttr(label)}">${escapeHtml(label)}</button>`)
        .join("")}`;
    }
    this.elements.quickLabel.value = labels.includes(current) ? current : "";
  }

  renderQuickColors() {
    if (!this.elements.quickColor || !this.elements.quickColorMenu) return;
    const current = this.elements.quickColor.value || "default";
    this.elements.quickColor.innerHTML = COLORS.map((color) => `<option value="${escapeAttr(color)}">${escapeHtml(color)}</option>`).join("");
    this.elements.quickColorMenu.innerHTML = `<div class="quick-color-grid">${COLORS.map((color) => {
      const lightColor = resolveThemeColor(color, "light");
      const darkColor = resolveThemeColor(color, "dark");
      const active = current === color ? " active" : "";
      return `<button class="color-dot note-${color}${active}" type="button" data-quick-color="${escapeAttr(color)}" style="--note-bg-light:${escapeAttr(lightColor || "var(--surface)")};--note-bg-dark:${escapeAttr(darkColor || "var(--surface)")};" aria-label="Kolor"></button>`;
    }).join("")}</div>`;
    this.elements.quickColor.value = COLORS.includes(current) ? current : "default";
  }

  noteCard(note, view) {
    const card = document.createElement("article");
    const color = resolveNoteColor(note.color);
    card.className = `note-card note-${color.key}`;
    card.dataset.id = note.id;
    card.tabIndex = 0;
    const lightColor = resolveThemeColor(note.color, "light");
    const darkColor = resolveThemeColor(note.color, "dark");
    if (lightColor) card.style.setProperty("--note-bg-light", lightColor);
    if (darkColor) card.style.setProperty("--note-bg-dark", darkColor);

    card.innerHTML = `
      <div class="note-select-hint" aria-hidden="true">${uiIcon("check")}</div>
      <button class="card-menu-button" type="button" data-menu-toggle aria-label="Menu notatki">${uiIcon("more")}</button>
      <div class="card-menu hidden" data-card-menu>
        ${this.menuMarkup(note, view)}
      </div>
      <div class="note-content">
        ${note.title ? `<h2 class="note-title">${escapeHtml(note.title)}</h2>` : ""}
        <p class="note-body">${escapeHtml(previewText(note.body))}</p>
        ${note.labels?.length ? `<div class="note-labels">${note.labels.map((label) => `<span class="chip">${escapeHtml(label)}</span>`).join("")}</div>` : ""}
      </div>
      ${this.inlineActionsMarkup(note, view)}
    `;

    const cardId = () => card.dataset.id;

    card.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (event.target.closest("[data-card-menu]")) {
        event.stopPropagation();
        if (event.target.closest("[data-color-picker]")) return;
        if (button?.dataset.action) this.handlers.onAction(cardId(), button.dataset.action);
        this.closeMenus();
        return;
      }
      if (event.target.closest("[data-menu-toggle]")) {
        event.stopPropagation();
        this.toggleMenu(card);
        return;
      }
      if (button) {
        event.stopPropagation();
        if (button.dataset.action === "colorMenu") {
          this.toggleMenu(card);
          return;
        }
        this.handlers.onAction(cardId(), button.dataset.action);
        return;
      }
      if (view !== "trash") this.handlers.onOpen(cardId());
    });

    card.addEventListener("keydown", (event) => {
      if (event.target !== card) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (view !== "trash") this.handlers.onOpen(cardId());
      }
    });

    card.addEventListener("change", (event) => {
      const picker = event.target.closest("[data-color-picker]");
      if (!picker) return;
      event.stopPropagation();
      this.handlers.onAction(cardId(), `color:${picker.value}`);
      this.closeMenus();
    });

    if (view === "notes" || view === "label") {
      attachSwipe(card, () => this.handlers.onAction(cardId(), "archive"));
    }

    return card;
  }

  menuMarkup(note, view) {
    const actions = getCardMenuActions(note, view);
    const colorActions = actions.filter((item) => item.color);
    const customColorAction = actions.find((item) => item.customColor);
    const regularActions = actions.filter((item) => !item.color && !item.customColor);
    const currentColor = resolveNoteColor(note.color);
    const isCustomColor = currentColor.key === "custom";
    const colors = colorActions.length
      ? `<div class="card-menu-label">Zmień kolor</div><div class="color-row">${colorActions.map((item) => {
          const active = item.color === note.color ? " active" : "";
          const lightColor = resolveThemeColor(item.color, "light");
          const darkColor = resolveThemeColor(item.color, "dark");
          return `<button class="color-dot note-${item.color}${active}" type="button" data-action="${escapeAttr(item.action)}" title="${escapeAttr(item.label)}" style="--note-bg-light:${escapeAttr(lightColor || "var(--surface)")};--note-bg-dark:${escapeAttr(darkColor || "var(--surface)")};"><span>${escapeHtml(item.label)}</span></button>`;
        }).join("")}</div>`
      : "";
    const customColor = customColorAction
      ? `<label class="custom-color-row"><span class="custom-color-label">Własny kolor</span><span class="custom-color-swatch${isCustomColor ? " active" : ""}" style="--custom-color:${escapeAttr(currentColor.value || "#ffffff")}"></span><input type="color" data-color-picker value="${escapeAttr(currentColor.value || "#ffffff")}"></label>`
      : "";

    return `${regularActions.map((item) => `<button type="button" data-action="${escapeAttr(item.action)}">${escapeHtml(item.label)}</button>`).join("")}${colors}${customColor}`;
  }

  inlineActionsMarkup(note, view) {
    const actions = getInlineCardActions(note, view);
    if (actions.length === 0) return "";
    return `<div class="note-actions" aria-label="Szybkie akcje na notatce">${actions
      .map((item) => `<button type="button" data-action="${escapeAttr(item.action)}" aria-label="${escapeAttr(item.label)}" title="${escapeAttr(item.label)}">${uiIcon(item.icon)}<span class="sr-only">${escapeHtml(item.label)}</span></button>`)
      .join("")}</div>`;
  }

  toggleMenu(card) {
    const menu = card.querySelector("[data-card-menu]");
    const isHidden = menu.classList.contains("hidden");
    this.closeMenus();
    if (isHidden) {
      menu.classList.remove("hidden");
      card.classList.add("menu-open");
      document.documentElement.classList.add("note-menu-open");
      return;
    }
    menu.classList.add("hidden");
  }

  closeMenus() {
    document.documentElement.classList.remove("note-menu-open");
    document.querySelectorAll(".note-card.menu-open").forEach((card) => card.classList.remove("menu-open"));
    document.querySelectorAll("[data-card-menu]").forEach((menu) => menu.classList.add("hidden"));
  }
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".note-card")) {
    document.querySelectorAll("[data-card-menu]").forEach((menu) => menu.classList.add("hidden"));
  }
});

function uiIcon(name) {
  const icons = {
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="19" r="1.8"></circle></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5 10 16l8-8"></path></svg>',
    palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="11" r="7"></circle><circle cx="9" cy="8" r="1"></circle><circle cx="15" cy="7.5" r="1"></circle><circle cx="17.5" cy="12" r="1"></circle><circle cx="12" cy="15.5" r="1"></circle></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"></path></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4v4l3 3v2H7v-2l3-3V4"></path><path d="M12 13v7"></path></svg>',
    archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="4" rx="1.5"></rect><path d="M6 9h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z"></path><path d="M10 13h4"></path></svg>',
    restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9H5V6"></path><path d="M5 9a7 7 0 1 1-1 3.6"></path><path d="M12 8v5l3 2"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"></path><path d="M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12"></path></svg>',
    bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8.5 14.5a6 6 0 1 1 7 0c-.9.7-1.5 1.8-1.5 2.9H10c0-1.1-.6-2.2-1.5-2.9Z"></path></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"></path></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"></circle><path d="M5 19a7 7 0 0 1 14 0"></path></svg>',
    briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="12" rx="2"></rect><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"></path><path d="M3 12h18"></path></svg>',
    label: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5V5a1 1 0 0 1 1-1h5.5L20 13.5 13.5 20 4 10.5Z"></path><circle cx="8" cy="8" r="1.3"></circle></svg>',
  };
  return `<span class="ui-icon">${icons[name] || icons.label}</span>`;
}

function sidebarIconForLabel(label) {
  const map = {
    Inspiracje: "spark",
    Osobiste: "user",
    Praca: "briefcase",
  };
  return uiIcon(map[label] || "label");
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
