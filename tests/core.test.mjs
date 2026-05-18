import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COLORS,
  computeMasonryLayout,
  createNote,
  filterNotes,
  getCardMenuActions,
  getInlineCardActions,
  mergeImportedNotes,
  moveToTrash,
  previewText,
  resolveNoteColor,
  resolveThemeColor,
  sortNotes,
  shouldArchiveSwipe,
  toggleArchive,
  updateNote,
} from "../src/core.js";
import { copyTextToClipboard } from "../src/clipboard.js";

describe("core note behavior", () => {
  it("creates notes with the expected sync-ready shape", () => {
    const note = createNote({
      title: "Tytuł",
      body: "Treść",
      labels: ["Praca"],
      now: "2026-05-17T10:00:00.000Z",
      order: 1000,
    });

    assert.equal(note.title, "Tytuł");
    assert.equal(note.body, "Treść");
    assert.deepEqual(note.labels, ["Praca"]);
    assert.equal(note.archived, false);
    assert.equal(note.deleted, false);
    assert.equal(note.pinned, false);
    assert.equal(note.dirty, true);
    assert.equal(note.syncStatus, "local");
    assert.equal(note.version, 1);
  });

  it("filters active, archived, deleted, labels, and search results", () => {
    const notes = [
      createNote({ title: "Active", body: "city note", labels: ["Praca"], now: "2026-05-17T10:00:00.000Z" }),
      { ...createNote({ title: "Archived", body: "old", now: "2026-05-17T10:01:00.000Z" }), archived: true },
      { ...createNote({ title: "Trash", body: "gone", now: "2026-05-17T10:02:00.000Z" }), deleted: true },
    ];

    assert.deepEqual(filterNotes(notes, { view: "notes" }).map((note) => note.title), ["Active"]);
    assert.deepEqual(filterNotes(notes, { view: "archive" }).map((note) => note.title), ["Archived"]);
    assert.deepEqual(filterNotes(notes, { view: "trash" }).map((note) => note.title), ["Trash"]);
    assert.deepEqual(filterNotes(notes, { view: "label", label: "Praca" }).map((note) => note.title), ["Active"]);
    assert.deepEqual(filterNotes(notes, { view: "notes", query: "CITY" }).map((note) => note.title), ["Active"]);
  });

  it("merges imported notes by id and preserves conflict copies", () => {
    const local = [
      {
        ...createNote({ id: "same", title: "Local", body: "A", now: "2026-05-17T10:00:00.000Z" }),
        updatedAt: "2026-05-17T10:30:00.000Z",
      },
    ];
    const imported = [
      {
        ...createNote({ id: "same", title: "Remote", body: "B", now: "2026-05-17T10:00:00.000Z" }),
        updatedAt: "2026-05-17T10:30:00.000Z",
        dirty: true,
      },
    ];

    const result = mergeImportedNotes(local, imported);

    assert.equal(result.notes.length, 2);
    assert.equal(result.notes.some((note) => note.id === "same" && note.title === "Local"), true);
    assert.equal(result.notes.some((note) => note.title.includes("Remote") && note.title.includes("konflikt")), true);
  });

  it("archives only intentional right swipes", () => {
    assert.equal(shouldArchiveSwipe({ deltaX: 110, deltaY: 12 }), true);
    assert.equal(shouldArchiveSwipe({ deltaX: 40, deltaY: 4 }), false);
    assert.equal(shouldArchiveSwipe({ deltaX: 110, deltaY: 80 }), false);
    assert.equal(shouldArchiveSwipe({ deltaX: -130, deltaY: 8 }), false);
  });

  it("keeps card preview short for very long notes", () => {
    const text = "Ala ma kota. ".repeat(3000);
    const preview = previewText(text);

    assert.equal(preview.length <= 423, true);
    assert.equal(preview.endsWith("..."), true);
  });

  it("returns contextual card menu actions", () => {
    const note = createNote({ title: "Menu", body: "Body" });
    const archiveActions = getCardMenuActions({ ...note, archived: true }, "archive").map((action) => action.action);
    const noteActions = getCardMenuActions(note, "notes").map((action) => action.action);

    assert.deepEqual(noteActions, [
      "copy",
      "pin",
      "archive",
      "trash",
      "color:default",
      "color:rose",
      "color:peach",
      "color:amber",
      "color:sand",
      "color:mint",
      "color:green",
      "color:lime",
      "color:teal",
      "color:cyan",
      "color:blue",
      "color:indigo",
      "color:violet",
      "color:coral",
      "customColor",
    ]);
    assert.equal(archiveActions.includes("unarchive"), true);
    assert.equal(archiveActions.includes("archive"), false);
  });

  it("returns contextual inline card actions", () => {
    const note = createNote({ title: "Inline", body: "Body" });

    assert.deepEqual(getInlineCardActions(note, "notes").map((action) => action.action), [
      "copy",
      "colorMenu",
      "pin",
      "archive",
      "trash",
    ]);
    assert.deepEqual(getInlineCardActions({ ...note, archived: true }, "archive").map((action) => action.action), [
      "copy",
      "colorMenu",
      "pin",
      "unarchive",
      "trash",
    ]);
    assert.deepEqual(getInlineCardActions({ ...note, deleted: true }, "trash").map((action) => action.action), [
      "copy",
      "restore",
      "deleteForever",
    ]);
  });

  it("archives and moves notes to trash without destroying the note", () => {
    const note = createNote({ title: "State", body: "Body", now: "2026-05-17T10:00:00.000Z" });
    const archived = toggleArchive(note, true, "2026-05-17T10:01:00.000Z");
    const deleted = moveToTrash(archived, "2026-05-17T10:02:00.000Z");

    assert.equal(archived.archived, true);
    assert.equal(archived.deleted, false);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.archived, false);
    assert.equal(deleted.deletedAt, "2026-05-17T10:02:00.000Z");
  });

  it("keeps note order stable when only the color changes", () => {
    const older = createNote({
      id: "older",
      title: "Starsza",
      order: 2000,
      now: "2026-05-17T10:00:00.000Z",
      updatedAt: "2026-05-17T10:00:00.000Z",
    });
    const newer = createNote({
      id: "newer",
      title: "Nowsza",
      order: 1000,
      now: "2026-05-17T10:10:00.000Z",
      updatedAt: "2026-05-17T10:10:00.000Z",
    });

    const recolored = updateNote(newer, { color: "mint" }, "2026-05-17T12:00:00.000Z");
    const sorted = [older, recolored].sort(sortNotes);

    assert.deepEqual(sorted.map((note) => note.id), ["older", "newer"]);
    assert.equal(recolored.updatedAt, "2026-05-17T12:00:00.000Z");
  });

  it("accepts predefined and custom hex note colors", () => {
    assert.equal(COLORS.length, 14);
    assert.equal(createNote({ color: "teal" }).color, "teal");
    assert.equal(resolveNoteColor("rose").value, "#fecdd3");
    assert.equal(resolveNoteColor("teal").value, "#99f6e4");
    assert.equal(resolveNoteColor("lime").value, "#d9f99d");
    assert.equal(resolveNoteColor("coral").value, "#fecaca");
    assert.equal(resolveNoteColor("#123abc").value, "#123abc");
    assert.equal(resolveNoteColor("nope").key, "default");
  });

  it("uses the same theme color for swatches and cards", () => {
    assert.equal(resolveThemeColor("rose", "dark"), "#542330");
    assert.equal(resolveThemeColor("rose", "dark"), resolveThemeColor("rose", "dark"));
    assert.equal(resolveThemeColor("#123abc", "dark"), "#123abc");
  });

  it("falls back when async clipboard is unavailable", async () => {
    const writes = [];
    const fakeTextarea = {
      value: "",
      style: {},
      setAttribute() {},
      select() {
        writes.push(this.value);
      },
    };
    const fakeDocument = {
      body: {
        appendChild() {},
        removeChild() {},
      },
      createElement() {
        return fakeTextarea;
      },
      execCommand(command) {
        return command === "copy";
      },
    };

    const copied = await copyTextToClipboard("fallback text", {
      clipboard: null,
      documentRef: fakeDocument,
    });

    assert.equal(copied, true);
    assert.deepEqual(writes, ["fallback text"]);
  });

  it("lays out masonry cards left-to-right first, then fills shortest columns", () => {
    const layout = computeMasonryLayout({
      itemHeights: [120, 80, 220, 90, 160],
      containerWidth: 460,
      minColumnWidth: 140,
      gap: 20,
    });

    assert.equal(layout.columnCount, 3);
    assert.deepEqual(
      layout.positions.map(({ column, x, y }) => ({ column, x: Math.round(x), y })),
      [
        { column: 0, x: 0, y: 0 },
        { column: 1, x: 160, y: 0 },
        { column: 2, x: 320, y: 0 },
        { column: 1, x: 160, y: 100 },
        { column: 0, x: 0, y: 140 },
      ],
    );
    assert.equal(layout.height, 300);
  });
});
