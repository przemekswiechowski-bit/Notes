import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runSyncFromSettings } from "../src/syncUi.js";

describe("sync UI flow", () => {
  it("closes settings menu immediately and refreshes notes after merged sync", async () => {
    const calls = [];
    const state = { notes: [{ id: "old" }] };
    const mergedNotes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const sync = {
      async syncNow() {
        calls.push("syncNow");
        return {
          ok: true,
          action: "merged",
          imported: true,
          syncStatus: "saved",
          syncLabel: "Sync: zapisano",
          message: "Zsynchronizowano i scalono notatki.",
        };
      },
    };
    const repository = {
      async list() {
        calls.push("repository.list");
        return mergedNotes;
      },
    };

    const result = await runSyncFromSettings({
      sync,
      repository,
      state,
      render: () => calls.push("render"),
      renderSyncStatus: (payload) => calls.push(`status:${payload.syncStatus}`),
      showToast: (message) => calls.push(`toast:${message}`),
      closeSettingsMenu: () => calls.push("close"),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(state.notes, mergedNotes);
    assert.deepEqual(calls, [
      "close",
      "syncNow",
      "status:saved",
      "repository.list",
      "render",
      "toast:Zsynchronizowano i scalono notatki.",
    ]);
  });
});
