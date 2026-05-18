import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNote } from "../src/core.js";
import { SyncService } from "../src/syncService.js";

class FakeGoogleAuth {
  constructor({ configured = true, status = "authorized", token = "token-123" } = {}) {
    this.configured = configured;
    this.status = status;
    this.token = token;
  }

  isConfigured() {
    return this.configured;
  }

  getStatus() {
    return this.status;
  }

  getAccessToken() {
    return this.token;
  }

  async connect() {
    this.status = "authorized";
    return { ok: true, status: this.status, accessToken: this.token };
  }

  disconnect() {
    this.status = this.configured ? "signed_out" : "not_configured";
    return { ok: true, status: this.status };
  }
}

function createRepository(initialNotes = []) {
  let notes = structuredClone(initialNotes);
  let replacedWith = null;

  return {
    async list() {
      return structuredClone(notes);
    },
    async replaceAll(nextNotes) {
      replacedWith = structuredClone(nextNotes);
      notes = structuredClone(nextNotes);
    },
    getNotes() {
      return structuredClone(notes);
    },
    getReplacedWith() {
      return replacedWith ? structuredClone(replacedWith) : null;
    },
  };
}

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get(key) {
      return data.get(key) ?? "";
    },
    set(key, value) {
      data.set(key, value);
    },
    remove(key) {
      data.delete(key);
    },
  };
}

function jsonResponse(body, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    async json() {
      return structuredClone(body);
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

describe("sync service scaffold", () => {
  it("reports auth-related status without implementing Drive sync", async () => {
    const sync = new SyncService();

    const initial = sync.getSyncStatus();
    assert.equal(initial.authStatus, "signed_out");
    assert.match(initial.label, /Google/i);

    const result = await sync.syncNow();
    assert.equal(result.ok, false);
    assert.match(result.message, /Połącz Google/i);
  });

  it("shows reconnect status after reload when Google was connected earlier", () => {
    const sync = new SyncService(() => {}, {
      googleAuth: new FakeGoogleAuth({ status: "signed_out" }),
      storage: createMemoryStorage({ googleAuthWasConnected: "true" }),
    });

    const status = sync.getSyncStatus();
    assert.equal(status.connected, false);
    assert.equal(status.authStatus, "signed_out");
    assert.equal(status.googleLabel, "Google: połącz ponownie");
    assert.equal(status.syncLabel, "Sync: gotowy lokalnie");
  });

  it("returns to signed-out status after manual disconnect", () => {
    const storage = createMemoryStorage({ googleAuthWasConnected: "true" });
    const sync = new SyncService(() => {}, {
      googleAuth: new FakeGoogleAuth({ status: "authorized" }),
      storage,
    });

    sync.disconnectGoogle();
    const status = sync.getSyncStatus();

    assert.equal(storage.get("googleAuthWasConnected"), "");
    assert.equal(status.googleLabel, "Google: niezalogowany");
  });

  it("uploads local notes when remote sync file does not exist", async () => {
    const note = createNote({ title: "Local", body: "Only local note" });
    const repository = createRepository([note]);
    const requests = [];
    const fetchImpl = async (url, options = {}) => {
      requests.push({ url, options });
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [] });
      }
      if (String(url).includes("upload/drive/v3/files?uploadType=multipart")) {
        return jsonResponse({ id: "remote-file-1" });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const sync = new SyncService(() => {}, {
      repository,
      googleAuth: new FakeGoogleAuth(),
      fetchImpl,
    });

    const result = await sync.syncNow();

    assert.equal(result.ok, true);
    assert.equal(result.syncStatus, "saved");
    assert.match(result.syncLabel, /zapisano/i);
    assert.equal(requests.length, 2);
    assert.match(String(requests[1].url), /upload\/drive\/v3\/files\?uploadType=multipart/);
    assert.match(String(requests[1].options.body), /notes-sync\.json/);
    assert.match(String(requests[1].options.body), /appDataFolder/);
    assert.match(String(requests[1].options.body), /Only local note/);
  });

  it("imports remote notes into IndexedDB when local state is empty", async () => {
    const remoteNote = createNote({ title: "Remote", body: "Only remote note" });
    const repository = createRepository([]);
    const fetchImpl = async (url) => {
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-2", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-2?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [remoteNote] });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const sync = new SyncService(() => {}, {
      repository,
      googleAuth: new FakeGoogleAuth(),
      fetchImpl,
    });

    const result = await sync.syncNow();

    assert.equal(result.ok, true);
    assert.equal(result.syncStatus, "pulled");
    assert.match(result.syncLabel, /pobrano/i);
    assert.deepEqual(repository.getNotes(), [remoteNote]);
    assert.deepEqual(repository.getReplacedWith(), [remoteNote]);
  });

  it("reports conflict when both local and remote contain different data", async () => {
    const localNote = createNote({ id: "same-id", title: "Local", body: "local body" });
    const remoteNote = createNote({ id: "same-id", title: "Remote", body: "remote body" });
    const repository = createRepository([localNote]);
    const fetchImpl = async (url) => {
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-3", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-3?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [remoteNote] });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const sync = new SyncService(() => {}, {
      repository,
      googleAuth: new FakeGoogleAuth(),
      fetchImpl,
    });

    const result = await sync.syncNow();

    assert.equal(result.ok, false);
    assert.equal(result.syncStatus, "conflict");
    assert.match(result.syncLabel, /konflikt/i);
    assert.match(result.message, /Konflikt/i);
    assert.deepEqual(repository.getNotes(), [localNote]);
  });

  it("treats identical local and remote payloads as already synchronized", async () => {
    const note = createNote({ title: "Same", body: "same body" });
    const repository = createRepository([note]);
    const fetchImpl = async (url) => {
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-4", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-4?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [note] });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const sync = new SyncService(() => {}, {
      repository,
      googleAuth: new FakeGoogleAuth(),
      fetchImpl,
    });

    const result = await sync.syncNow();

    assert.equal(result.ok, true);
    assert.equal(result.syncStatus, "saved");
    assert.match(result.message, /już zgodne/i);
  });
});
