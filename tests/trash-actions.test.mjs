import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNote, moveToTrash } from "../src/core.js";
import { emptyTrash, getTrashNotes } from "../src/trashActions.js";

describe("trash actions", () => {
  it("returns only deleted notes", () => {
    const active = createNote({ id: "active", title: "Active" });
    const deleted = moveToTrash(createNote({ id: "deleted", title: "Deleted" }));

    assert.deepEqual(getTrashNotes([active, deleted]).map((note) => note.id), ["deleted"]);
  });

  it("removes every note from trash after confirmation", async () => {
    const active = createNote({ id: "active", title: "Active" });
    const deletedA = moveToTrash(createNote({ id: "deleted-a", title: "Deleted A" }));
    const deletedB = moveToTrash(createNote({ id: "deleted-b", title: "Deleted B" }));
    const removed = [];
    let scheduled = false;

    const result = await emptyTrash({
      notes: [active, deletedA, deletedB],
      repository: {
        async removeForever(note) {
          removed.push(note.id);
        },
      },
      confirm: async (count) => count === 2,
      sync: {
        async schedule() {
          scheduled = true;
        },
      },
    });

    assert.deepEqual(removed.sort(), ["deleted-a", "deleted-b"]);
    assert.equal(result.ok, true);
    assert.equal(result.removed, 2);
    assert.equal(scheduled, true);
  });

  it("does not remove trash notes when confirmation is cancelled", async () => {
    const deleted = moveToTrash(createNote({ id: "deleted", title: "Deleted" }));
    const removed = [];

    const result = await emptyTrash({
      notes: [deleted],
      repository: {
        async removeForever(note) {
          removed.push(note.id);
        },
      },
      confirm: async () => false,
    });

    assert.deepEqual(removed, []);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "cancelled");
  });
});
