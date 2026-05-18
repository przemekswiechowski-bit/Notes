import { copyTextToClipboard } from "./clipboard.js?v=20260518-drive-sync-ux";
import { filterNotes } from "./core.js?v=20260518-drive-sync-ux";
import { EditorController } from "./editor.js?v=20260518-drive-sync-ux";
import { exportNotes, readImportedNotes } from "./importExport.js?v=20260518-drive-sync-ux";
import { NotesRepository } from "./notesRepository.js?v=20260518-drive-sync-ux";
import { NotesRenderer } from "./renderer.js?v=20260518-drive-sync-ux";
import { SyncService } from "./syncService.js?v=20260518-drive-sync-ux";
import { runSyncFromSettings } from "./syncUi.js?v=20260518-drive-sync-ux";

const $ = (id) => document.getElementById(id);

const elements = {
  appShell: $("appShell"),
  sidebar: $("sidebar"),
  menuToggle: $("menuToggle"),
  searchInput: $("searchInput"),
  quickNote: $("quickNote"),
  quickTitle: $("quickTitle"),
  quickBody: $("quickBody"),
  quickLabel: $("quickLabel"),
  quickLabelToggle: $("quickLabelToggle"),
  quickLabelMenu: $("quickLabelMenu"),
  quickColor: $("quickColor"),
  quickColorToggle: $("quickColorToggle"),
  quickColorMenu: $("quickColorMenu"),
  quickAdd: $("quickAdd"),
  pinnedHeading: $("pinnedHeading"),
  othersHeading: $("othersHeading"),
  pinnedGrid: $("pinnedGrid"),
  notesGrid: $("notesGrid"),
  emptyState: $("emptyState"),
  labelList: $("labelList"),
  themeToggle: $("themeToggle"),
  settingsToggle: $("settingsToggle"),
  settingsMenu: $("settingsMenu"),
  themeMenuButton: $("themeMenuButton"),
  exportButton: $("exportButton"),
  importInput: $("importInput"),
  googleStatus: $("googleStatus"),
  driveSyncStatus: $("driveSyncStatus"),
  googleConnectButton: $("googleConnectButton"),
  googleDisconnectButton: $("googleDisconnectButton"),
  syncNowButton: $("syncNowButton"),
  toast: $("toast"),
};

const editorElements = {
  backdrop: $("editorBackdrop"),
  modal: $("editorModal"),
  title: $("editorTitle"),
  body: $("editorBody"),
  charCount: $("charCount"),
  dateInfo: $("dateInfo"),
  labels: $("editorLabels"),
  color: $("editorColor"),
  colorPalette: $("editorColorPalette"),
  customColor: $("editorCustomColor"),
  copy: $("editorCopy"),
  pin: $("editorPin"),
  archive: $("editorArchive"),
  delete: $("editorDelete"),
  close: $("editorClose"),
};

const repository = new NotesRepository();
const state = {
  notes: [],
  view: "notes",
  label: "",
  query: "",
};

const sync = new SyncService(renderSyncStatus, { repository });

const THEME_ICONS = {
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9A7 7 0 1 1 12 3Z"></path></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"></path></svg>',
};

const renderer = new NotesRenderer(elements, {
  onOpen: openEditor,
  onAction: handleAction,
});

const editor = new EditorController(editorElements, {
  save: saveNote,
  action: handleAction,
  copy: copyNote,
});

bindEvents();
initTheme();
load();

function bindEvents() {
  elements.menuToggle.addEventListener("click", () => {
    if (matchMedia("(max-width: 900px)").matches) {
      elements.sidebar.classList.toggle("open");
      return;
    }
    elements.appShell.classList.toggle("sidebar-collapsed");
  });
  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value;
    render();
  });
  elements.quickAdd.addEventListener("click", addQuickNote);
  [elements.quickTitle, elements.quickBody].forEach((input) => {
    input.addEventListener("focus", () => elements.quickNote.classList.add("expanded"));
  });
  elements.quickBody.addEventListener("input", () => autosizeQuickBody());
  elements.quickLabelToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.quickNote.classList.add("expanded");
    elements.quickColorMenu.classList.add("hidden");
    elements.quickLabelMenu.classList.toggle("hidden");
  });
  elements.quickColorToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.quickNote.classList.add("expanded");
    elements.quickLabelMenu.classList.add("hidden");
    elements.quickColorMenu.classList.toggle("hidden");
  });
  elements.quickLabelMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quick-label]");
    if (!button) return;
    elements.quickLabel.value = button.dataset.quickLabel;
    updateQuickLabelButton();
    elements.quickLabelMenu.classList.add("hidden");
  });
  elements.quickColorMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quick-color]");
    if (!button) return;
    elements.quickColor.value = button.dataset.quickColor;
    updateQuickColorButton();
    elements.quickColorMenu.classList.add("hidden");
  });
  elements.quickBody.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") addQuickNote();
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  elements.labelList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-label]");
    if (item) setView("label", item.dataset.label);
  });

  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.themeMenuButton.addEventListener("click", toggleTheme);
  elements.settingsToggle.addEventListener("click", () => elements.settingsMenu.classList.toggle("hidden"));
  elements.googleConnectButton?.addEventListener("click", async () => {
    const result = await sync.connectGoogle();
    if (!result.ok) {
      showToast(result.message || "Nie udało się połączyć z Google.");
      return;
    }
    showToast("Połączono z Google.");
  });
  elements.googleDisconnectButton?.addEventListener("click", () => {
    sync.disconnectGoogle();
    showToast("Odłączono Google.");
  });
  elements.syncNowButton?.addEventListener("click", async () => {
    await runSyncFromSettings({
      sync,
      repository,
      state,
      render,
      renderSyncStatus,
      showToast,
      closeSettingsMenu: () => elements.settingsMenu.classList.add("hidden"),
    });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".settings-menu") && !event.target.closest("#settingsToggle")) {
      elements.settingsMenu.classList.add("hidden");
    }
    if (!event.target.closest("#quickNote")) {
      elements.quickLabelMenu.classList.add("hidden");
      elements.quickColorMenu.classList.add("hidden");
      if (!elements.quickTitle.value.trim() && !elements.quickBody.value.trim()) {
        elements.quickNote.classList.remove("expanded");
      }
    }
  });

  elements.exportButton.addEventListener("click", () => exportNotes(state.notes));
  elements.importInput.addEventListener("change", importFile);
}

async function load() {
  try {
    state.notes = await repository.list();
    render();
    const reconnectResult = await sync.trySilentReconnect();
    renderSyncStatus(reconnectResult);
    if (reconnectResult.ok) {
      const result = await sync.syncNow();
      renderSyncStatus(result);
      if (result.imported || result.action === "merged") {
        state.notes = await repository.list();
        render();
      }
    }
  } catch (error) {
    showToast(error.message || "Nie udało się otworzyć lokalnej bazy.");
  }
}

function render() {
  const filtered = filterNotes(state.notes, state);
  renderer.render({ notes: state.notes, filtered, view: state.view, label: state.label });
  updateActiveNav();
}

function updateActiveNav() {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  if (state.view === "label") {
    const labelButton = elements.labelList.querySelector(`[data-label="${CSS.escape(state.label)}"]`);
    labelButton?.classList.add("active");
    return;
  }
  document.querySelector(`[data-view="${state.view}"]`)?.classList.add("active");
}

function setView(view, label = "") {
  state.view = view;
  state.label = label;
  elements.sidebar.classList.remove("open");
  render();
}

async function addQuickNote() {
  const title = elements.quickTitle.value.trim();
  const body = elements.quickBody.value.trim();
  const label = elements.quickLabel.value;
  const color = elements.quickColor.value;
  if (!title && !body) return;

  const note = await repository.create({
    title,
    body,
    labels: label ? [label] : [],
    color,
    order: Date.now(),
  });
  state.notes.unshift(note);
  elements.quickTitle.value = "";
  elements.quickBody.value = "";
  elements.quickLabel.value = "";
  elements.quickColor.value = "default";
  updateQuickLabelButton();
  updateQuickColorButton();
  resetQuickBodySize();
  elements.quickNote.classList.remove("expanded");
  setView("notes");
  await sync.schedule();
}

function openEditor(id) {
  const note = findNote(id);
  if (note) editor.open(note, state.notes);
}

async function saveNote(note, patch) {
  const next = await repository.save(note, patch);
  replaceNote(next);
  render();
  await sync.schedule();
  return next;
}

async function handleAction(id, action) {
  const note = findNote(id);
  if (!note) return;

  if (action === "copy") return copyNote(note);
  if (action === "pin") return saveNote(note, { pinned: !note.pinned });
  if (action?.startsWith("color:")) {
    const color = action.split(":")[1];
    return saveNote(note, { color });
  }

  if (action === "archive") {
    const next = await repository.archive(note);
    replaceNote(next);
    render();
    showToast("Przeniesiono do archiwum", {
      label: "Cofnij",
      action: async () => {
        const restored = await repository.unarchive(next);
        replaceNote(restored);
        render();
      },
    });
    return sync.schedule();
  }

  if (action === "unarchive") {
    const next = await repository.unarchive(note);
    replaceNote(next);
    render();
    showToast("Przywrócono z archiwum");
    return sync.schedule();
  }

  if (action === "trash") {
    const next = await repository.trash(note);
    replaceNote(next);
    render();
    showToast("Przeniesiono do kosza", {
      label: "Cofnij",
      action: async () => {
        const restored = await repository.restore(next);
        replaceNote(restored);
        render();
      },
    });
    return sync.schedule();
  }

  if (action === "restore") {
    const next = await repository.restore(note);
    replaceNote(next);
    render();
    showToast("Przywrócono notatkę");
    return sync.schedule();
  }

  if (action === "deleteForever") {
    await repository.removeForever(note);
    state.notes = state.notes.filter((item) => item.id !== note.id);
    render();
    showToast("Usunięto trwale");
    return sync.schedule();
  }
}

async function copyNote(note) {
  const copied = await copyTextToClipboard(note.body || "");
  if (copied) {
    showToast("Skopiowano");
  } else {
    showToast("Nie udało się skopiować automatycznie. Otwórz notatkę i zaznacz tekst ręcznie.");
  }
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = await readImportedNotes(file);
    const result = await repository.importNotes(imported);
    state.notes = result.notes;
    render();
    showToast(`Import: dodano ${result.added}, zaktualizowano ${result.updated}, konflikty ${result.conflicts}`);
  } catch (error) {
    showToast(error.message || "Import nie powiódł się.");
  } finally {
    event.target.value = "";
  }
}

function findNote(id) {
  return state.notes.find((note) => note.id === id);
}

function replaceNote(note) {
  const index = state.notes.findIndex((item) => item.id === note.id);
  if (index >= 0) state.notes.splice(index, 1, note);
  else state.notes.unshift(note);
}

function updateQuickLabelButton() {
  const label = elements.quickLabel.value;
  elements.quickLabelToggle.classList.toggle("active", Boolean(label));
  elements.quickLabelToggle.title = label ? `Etykieta: ${label}` : "Etykieta";
}

function updateQuickColorButton() {
  const color = elements.quickColor.value || "default";
  elements.quickColorToggle.classList.toggle("active", color !== "default");
  elements.quickColorToggle.style.removeProperty("--quick-color-light");
  elements.quickColorToggle.style.removeProperty("--quick-color-dark");
  elements.quickNote.style.removeProperty("--quick-note-bg-light");
  elements.quickNote.style.removeProperty("--quick-note-bg-dark");
  const activeButton = elements.quickColorMenu.querySelector(`[data-quick-color="${CSS.escape(color)}"]`);
  elements.quickColorMenu.querySelectorAll("[data-quick-color]").forEach((button) => {
    button.classList.toggle("active", button.dataset.quickColor === color);
  });
  if (activeButton) {
    const lightColor = activeButton.style.getPropertyValue("--note-bg-light");
    const darkColor = activeButton.style.getPropertyValue("--note-bg-dark");
    elements.quickColorToggle.style.setProperty("--quick-color-light", lightColor);
    elements.quickColorToggle.style.setProperty("--quick-color-dark", darkColor);
    if (color !== "default") {
      elements.quickNote.style.setProperty("--quick-note-bg-light", lightColor);
      elements.quickNote.style.setProperty("--quick-note-bg-dark", darkColor);
    }
  }
}

function autosizeQuickBody() {
  elements.quickBody.style.height = "auto";
  const maxHeight = 480;
  const nextHeight = Math.min(elements.quickBody.scrollHeight, maxHeight);
  elements.quickBody.style.height = `${Math.max(48, nextHeight)}px`;
  elements.quickBody.classList.toggle("scrollable", elements.quickBody.scrollHeight > maxHeight);
}

function resetQuickBodySize() {
  elements.quickBody.classList.remove("scrollable");
  elements.quickBody.scrollTop = 0;
  elements.quickBody.style.height = "";
}

function showToast(message, undo) {
  elements.toast.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = message;
  elements.toast.append(text);
  if (undo) {
    const button = document.createElement("button");
    button.textContent = undo.label;
    button.addEventListener("click", async () => {
      await undo.action();
      elements.toast.classList.add("hidden");
    });
    elements.toast.append(button);
  }
  elements.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.add("hidden"), 3200);
}

function initTheme() {
  const saved = localStorage.getItem("notes-theme");
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved || (prefersDark ? "dark" : "light");
  syncThemeToggleIcon();
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("notes-theme", next);
  syncThemeToggleIcon();
}

function syncThemeToggleIcon() {
  const iconWrap = elements.themeToggle?.querySelector(".ui-icon");
  if (!iconWrap) return;
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  iconWrap.innerHTML = THEME_ICONS[theme];
}

function renderSyncStatus(syncState = {}) {
  if (elements.googleStatus) {
    elements.googleStatus.textContent = syncState.googleLabel || syncState.label || "Google: niezalogowany";
  }
  if (elements.driveSyncStatus) {
    elements.driveSyncStatus.textContent = syncState.syncLabel || "Sync: gotowy lokalnie";
  }
  if (elements.googleConnectButton) {
    elements.googleConnectButton.classList.toggle("hidden", Boolean(syncState.connected));
    elements.googleConnectButton.disabled = syncState.authStatus === "authorizing";
  }
  if (elements.googleDisconnectButton) {
    elements.googleDisconnectButton.classList.toggle("hidden", !syncState.connected);
  }
  if (elements.syncNowButton) {
    elements.syncNowButton.disabled = syncState.authStatus === "authorizing" || syncState.syncStatus === "syncing";
  }
}

