export const DEFAULT_LABELS = ["Inspiracje", "Osobiste", "Praca"];
export const COLORS = [
  "default",
  "rose",
  "peach",
  "amber",
  "sand",
  "mint",
  "green",
  "lime",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "coral",
];
export const COLOR_LABELS = {
  default: "Domyślny",
  rose: "Róż",
  peach: "Brzoskwinia",
  amber: "Bursztyn",
  sand: "Piasek",
  mint: "Mięta",
  green: "Zieleń",
  lime: "Limonka",
  teal: "Teal",
  cyan: "Cyjan",
  blue: "Niebieski",
  indigo: "Indygo",
  violet: "Fiolet",
  coral: "Koral",
};
export const COLOR_VALUES = {
  default: null,
  rose: "#f9c2cf",
  peach: "#fed7aa",
  amber: "#fde68a",
  sand: "#f6edcf",
  mint: "#d7efe8",
  green: "#bbf7d0",
  lime: "#d9f99d",
  teal: "#99f6e4",
  cyan: "#bae6fd",
  blue: "#dbeafe",
  indigo: "#ddd6fe",
  violet: "#f3d8ff",
  coral: "#fec4b3",
};
export const DARK_COLOR_VALUES = {
  default: null,
  rose: "#5b2538",
  peach: "#4a2d24",
  amber: "#4b3a18",
  sand: "#453c25",
  mint: "#25443b",
  green: "#21442d",
  lime: "#365314",
  teal: "#164e43",
  cyan: "#1e3f4f",
  blue: "#22364f",
  indigo: "#312b54",
  violet: "#43264f",
  coral: "#5f2f24",
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createNote({
  id = makeId(),
  title = "",
  body = "",
  color = "default",
  labels = [],
  pinned = false,
  archived = false,
  deleted = false,
  createdAt,
  updatedAt,
  deletedAt = null,
  order,
  version = 1,
  dirty = true,
  syncStatus = "local",
  now = new Date().toISOString(),
} = {}) {
  const timestamp = createdAt || now;
  return {
    id,
    title: String(title),
    body: String(body),
    color: normalizeColor(color),
    labels: normalizeLabels(labels),
    pinned: Boolean(pinned),
    archived: Boolean(archived),
    deleted: Boolean(deleted),
    createdAt: timestamp,
    updatedAt: updatedAt || timestamp,
    deletedAt,
    order: Number.isFinite(order) ? order : Date.now(),
    version: Number.isFinite(version) ? version : 1,
    dirty: Boolean(dirty),
    syncStatus,
  };
}

export function normalizeNote(input) {
  return createNote({
    ...input,
    labels: normalizeLabels(input?.labels),
    now: input?.createdAt || new Date().toISOString(),
  });
}

export function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return [...new Set(labels.map((label) => String(label).trim()).filter(Boolean))];
}

export function getKnownLabels(notes, defaults = DEFAULT_LABELS) {
  const labels = new Set(defaults);
  notes.forEach((note) => normalizeLabels(note.labels).forEach((label) => labels.add(label)));
  return [...labels].sort((a, b) => a.localeCompare(b, "pl"));
}

export function filterNotes(notes, { view = "notes", label = "", query = "" } = {}) {
  const needle = query.trim().toLocaleLowerCase("pl");
  return notes
    .filter((note) => {
      if (view === "archive") return note.archived && !note.deleted;
      if (view === "trash") return note.deleted;
      if (view === "label") return !note.deleted && normalizeLabels(note.labels).includes(label);
      return !note.archived && !note.deleted;
    })
    .filter((note) => {
      if (!needle) return true;
      return `${note.title}\n${note.body}`.toLocaleLowerCase("pl").includes(needle);
    })
    .sort(sortNotes);
}

export function sortNotes(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return (Number(b.order) || 0) - (Number(a.order) || 0);
}

export function computeMasonryLayout({ itemHeights = [], containerWidth = 0, minColumnWidth = 220, gap = 14 } = {}) {
  const width = Math.max(0, Number(containerWidth) || 0);
  if (!itemHeights.length || width <= 0) {
    return { columnCount: 1, columnWidth: width, positions: [], height: 0 };
  }

  const safeMinWidth = Math.max(1, Number(minColumnWidth) || 1);
  const safeGap = Math.max(0, Number(gap) || 0);
  const columnCount = Math.max(1, Math.floor((width + safeGap) / (safeMinWidth + safeGap)));
  const totalGap = safeGap * (columnCount - 1);
  const columnWidth = Math.max(0, (width - totalGap) / columnCount);
  const columnHeights = new Array(columnCount).fill(0);

  const positions = itemHeights.map((rawHeight, index) => {
    const height = Math.max(0, Number(rawHeight) || 0);
    const column = index < columnCount ? index : indexOfShortestColumn(columnHeights);
    const x = column * (columnWidth + safeGap);
    const y = columnHeights[column];
    columnHeights[column] += height + safeGap;
    return { x, y, width: columnWidth, height, column };
  });

  const tallestColumn = Math.max(...columnHeights);
  return {
    columnCount,
    columnWidth,
    positions,
    height: Math.max(0, tallestColumn - safeGap),
  };
}

export function splitPinned(notes) {
  return {
    pinned: notes.filter((note) => note.pinned),
    others: notes.filter((note) => !note.pinned),
  };
}

export function previewText(body, max = 420) {
  const text = String(body || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

export function normalizeColor(color) {
  const value = String(color || "default").trim();
  if (COLORS.includes(value)) return value;
  if (HEX_COLOR_PATTERN.test(value)) return value.toLowerCase();
  return "default";
}

export function resolveNoteColor(color) {
  const key = normalizeColor(color);
  if (COLORS.includes(key)) {
    return { key, value: COLOR_VALUES[key], label: COLOR_LABELS[key] };
  }
  return { key: "custom", value: key, label: key };
}

export function resolveThemeColor(color, theme = "light") {
  const key = normalizeColor(color);
  if (!COLORS.includes(key)) return key;
  const values = theme === "dark" ? DARK_COLOR_VALUES : COLOR_VALUES;
  return values[key] || null;
}

export function getCardMenuActions(note, view) {
  const archiveAction = view === "archive"
    ? { action: "unarchive", label: "Przywróć z archiwum" }
    : { action: "archive", label: "Archiwizuj" };
  const actions = [
    { action: "copy", label: "Kopiuj treść" },
    { action: "pin", label: note.pinned ? "Odepnij" : "Przypnij" },
  ];

  if (view !== "trash") {
    actions.push(archiveAction, { action: "trash", label: "Usuń" });
    COLORS.forEach((color) => actions.push({ action: `color:${color}`, label: COLOR_LABELS[color], color }));
    actions.push({ action: "customColor", label: "Własny kolor", customColor: true });
  } else {
    actions.push({ action: "restore", label: "Przywróć" }, { action: "deleteForever", label: "Usuń trwale" });
  }

  return actions;
}

export function getInlineCardActions(note, view) {
  if (view === "trash") {
    return [
      { action: "copy", label: "Kopiuj treść", icon: "copy" },
      { action: "restore", label: "Przywróć", icon: "restore" },
      { action: "deleteForever", label: "Usuń trwale", icon: "trash" },
    ];
  }

  if (view === "archive") {
    return [
      { action: "copy", label: "Kopiuj treść", icon: "copy" },
      { action: "colorMenu", label: "Zmień kolor", icon: "palette" },
      { action: "pin", label: note?.pinned ? "Odepnij" : "Przypnij", icon: "pin" },
      { action: "unarchive", label: "Przywróć z archiwum", icon: "restore" },
      { action: "trash", label: "Usuń", icon: "trash" },
    ];
  }

  return [
    { action: "copy", label: "Kopiuj treść", icon: "copy" },
    { action: "colorMenu", label: "Zmień kolor", icon: "palette" },
    { action: "pin", label: note?.pinned ? "Odepnij" : "Przypnij", icon: "pin" },
    { action: "archive", label: "Archiwizuj", icon: "archive" },
    { action: "trash", label: "Usuń", icon: "trash" },
  ];
}

function indexOfShortestColumn(columnHeights) {
  let shortestIndex = 0;
  let shortestValue = columnHeights[0] ?? 0;
  for (let index = 1; index < columnHeights.length; index += 1) {
    if (columnHeights[index] < shortestValue) {
      shortestValue = columnHeights[index];
      shortestIndex = index;
    }
  }
  return shortestIndex;
}

export function updateNote(note, patch, now = new Date().toISOString()) {
  return {
    ...note,
    ...patch,
    color: patch.color ? normalizeColor(patch.color) : note.color,
    labels: patch.labels ? normalizeLabels(patch.labels) : note.labels,
    updatedAt: now,
    version: (Number(note.version) || 1) + 1,
    dirty: true,
    syncStatus: "local",
  };
}

export function moveToTrash(note, now = new Date().toISOString()) {
  return updateNote(note, { deleted: true, deletedAt: now, archived: false }, now);
}

export function restoreFromTrash(note, now = new Date().toISOString()) {
  return updateNote(note, { deleted: false, deletedAt: null }, now);
}

export function toggleArchive(note, archived, now = new Date().toISOString()) {
  return updateNote(note, { archived: Boolean(archived), deleted: false, deletedAt: null }, now);
}

export function shouldArchiveSwipe({ deltaX, deltaY, threshold = 90, maxVertical = 50 }) {
  return deltaX >= threshold && Math.abs(deltaY) <= maxVertical;
}

export function mergeImportedNotes(localNotes, importedNotes) {
  const byId = new Map(localNotes.map((note) => [note.id, normalizeNote(note)]));
  const notes = [...byId.values()];
  let added = 0;
  let updated = 0;
  let conflicts = 0;

  importedNotes.map(normalizeNote).forEach((incoming) => {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      notes.push(incoming);
      added += 1;
      return;
    }

    const incomingTime = new Date(incoming.updatedAt).getTime();
    const existingTime = new Date(existing.updatedAt).getTime();
    const bothDirty = existing.dirty && incoming.dirty;

    if (incomingTime > existingTime && !bothDirty) {
      const index = notes.findIndex((note) => note.id === incoming.id);
      notes[index] = incoming;
      byId.set(incoming.id, incoming);
      updated += 1;
      return;
    }

    if (incomingTime === existingTime && hasContentConflict(existing, incoming)) {
      const conflict = createNote({
        ...incoming,
        id: makeId(),
        title: `${incoming.title || "Bez tytułu"} (kopia konfliktu)`,
        labels: normalizeLabels([...incoming.labels, "Konflikt"]),
        now: new Date().toISOString(),
      });
      notes.push(conflict);
      conflicts += 1;
    }
  });

  return { notes: notes.sort(sortNotes), added, updated, conflicts };
}

function hasContentConflict(a, b) {
  return a.title !== b.title || a.body !== b.body || JSON.stringify(a.labels) !== JSON.stringify(b.labels);
}

export function mergeSyncNotes(localNotes, remoteNotes, now = new Date().toISOString()) {
  const localMap = new Map(localNotes.map((note) => {
    const normalized = normalizeNote(note);
    return [normalized.id, normalized];
  }));
  const remoteMap = new Map(remoteNotes.map((note) => {
    const normalized = normalizeNote(note);
    return [normalized.id, normalized];
  }));
  const merged = [];
  let conflicts = 0;

  const ids = new Set([...localMap.keys(), ...remoteMap.keys()]);
  ids.forEach((id) => {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (!local) {
      if (remote.deleted) return;
      merged.push(remote);
      return;
    }

    if (!remote) {
      merged.push(local);
      return;
    }

    if (areSameForSync(local, remote)) {
      merged.push(local);
      return;
    }

    const localTime = getSyncTimestamp(local);
    const remoteTime = getSyncTimestamp(remote);

    if (localTime > remoteTime) {
      merged.push(local);
      return;
    }

    if (remoteTime > localTime) {
      merged.push(remote);
      return;
    }

    merged.push(local);
    merged.push(createConflictCopy(remote, now));
    conflicts += 1;
  });

  return {
    notes: merged.sort(sortNotes),
    conflicts,
  };
}

function areSameForSync(a, b) {
  return JSON.stringify(syncComparable(a)) === JSON.stringify(syncComparable(b));
}

function syncComparable(note) {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    color: note.color,
    labels: [...normalizeLabels(note.labels)].sort(),
    pinned: Boolean(note.pinned),
    archived: Boolean(note.archived),
    deleted: Boolean(note.deleted),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt,
    order: note.order,
    version: note.version,
  };
}

function getSyncTimestamp(note) {
  const deletedChange = note.deleted ? Date.parse(note.deletedAt || note.updatedAt || note.createdAt || 0) : Number.NaN;
  if (Number.isFinite(deletedChange)) return deletedChange;
  const updated = Date.parse(note.updatedAt || note.createdAt || 0);
  return Number.isFinite(updated) ? updated : 0;
}

function createConflictCopy(note, now) {
  return createNote({
    ...note,
    id: makeId(),
    title: `${note.title || "Bez tytułu"} (konflikt)`,
    updatedAt: now,
    version: (Number(note.version) || 1) + 1,
    dirty: true,
    syncStatus: "local",
    now,
  });
}
