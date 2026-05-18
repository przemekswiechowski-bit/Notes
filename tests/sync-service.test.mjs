import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SyncService } from "../src/syncService.js";

describe("sync service scaffold", () => {
  it("reports auth-related status without implementing Drive sync", async () => {
    const sync = new SyncService();

    const initial = sync.getSyncStatus();
    assert.equal(initial.authStatus, "signed_out");
    assert.match(initial.label, /Google/i);

    const result = await sync.syncNow();
    assert.equal(result.ok, false);
    assert.match(result.message, /not implemented yet/i);
  });
});
