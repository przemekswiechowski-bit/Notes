import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNote } from "../src/core.js";
import { SyncService } from "../src/syncService.js";

class FakeGoogleAuth {
  constructor({
    configured = true,
    status = "authorized",
    token = "token-123",
    silentReconnectResult = null,
  } = {}) {
    this.configured = configured;
    this.status = status;
    this.token = token;
    this.silentReconnectResult = silentReconnectResult;
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

  async reconnectSilently() {
    if (this.silentReconnectResult) {
      this.status = this.silentReconnectResult.ok ? "authorized" : "signed_out";
      if (this.silentReconnectResult.accessToken) {
        this.token = this.silentReconnectResult.accessToken;
      }
      if (!this.silentReconnectResult.ok) {
        this.token = "";
      }
      return {
        status: this.status,
        ...this.silentReconnectResult,
      };
    }

    this.status = "signed_out";
    this.token = "";
    return { ok: false, status: this.status, silent: true };
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

  it("restores authorized status after a successful silent reconnect", async () => {
    const storage = createMemoryStorage({ googleAuthWasConnected: "true" });
    const sync = new SyncService(() => {}, {
      googleAuth: new FakeGoogleAuth({
        status: "signed_out",
        token: "",
        silentReconnectResult: { ok: true, accessToken: "silent-token", silent: true },
      }),
      storage,
    });

    const result = await sync.trySilentReconnect();

    assert.equal(result.ok, true);
    assert.equal(result.connected, true);
    assert.equal(result.googleLabel, "Google: zalogowany");
    assert.equal(result.syncLabel, "Sync: gotowy");
    assert.equal(storage.get("googleAuthWasConnected"), "true");
  });

  it("keeps reconnect status without hard error when silent reconnect fails", async () => {
    const storage = createMemoryStorage({ googleAuthWasConnected: "true" });
    const sync = new SyncService(() => {}, {
      googleAuth: new FakeGoogleAuth({
        status: "signed_out",
        token: "",
        silentReconnectResult: { ok: false, silent: true, message: "No active session" },
      }),
      storage,
    });

    const result = await sync.trySilentReconnect();

    assert.equal(result.ok, false);
    assert.equal(result.authStatus, "signed_out");
    assert.equal(result.googleLabel, "Google: połącz ponownie");
    assert.equal(result.syncLabel, "Sync: gotowy lokalnie");
    assert.equal(result.error, "");
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

  it("does not import remote-only deleted notes after local trash was emptied", async () => {
    const remoteDeleted = {
      ...createNote({
        id: "remote-deleted",
        title: "Removed",
        body: "Trash should stay empty",
        updatedAt: "2026-05-24T10:10:00.000Z",
      }),
      deleted: true,
      deletedAt: "2026-05-24T10:10:00.000Z",
      updatedAt: "2026-05-24T10:10:00.000Z",
    };
    const repository = createRepository([]);
    const requests = [];
    const fetchImpl = async (url, options = {}) => {
      requests.push({ url, options });
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-trash", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-trash?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [remoteDeleted] });
      }
      if (String(url).includes("upload/drive/v3/files/remote-file-trash?uploadType=multipart")) {
        return jsonResponse({ id: "remote-file-trash" });
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
    assert.deepEqual(repository.getNotes(), []);
    assert.match(String(requests.at(-1).options.body), /"notes":\[\]/);
  });

  it("merges local A+C with remote A+B into A+B+C", async () => {
    const shared = createNote({ id: "shared", title: "A", body: "shared" });
    const localOnly = createNote({ id: "local-only", title: "C", body: "local only" });
    const remoteOnly = createNote({ id: "remote-only", title: "B", body: "remote only" });
    const repository = createRepository([shared, localOnly]);
    const fetchImpl = async (url) => {
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-3", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-3?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [shared, remoteOnly] });
      }
      if (String(url).includes("upload/drive/v3/files/remote-file-3?uploadType=multipart")) {
        return jsonResponse({ id: "remote-file-3" });
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
    assert.equal(repository.getNotes().length, 3);
    assert.deepEqual(
      repository.getNotes().map((note) => note.id).sort(),
      ["local-only", "remote-only", "shared"],
    );
    assert.match(result.message, /scalono/i);
  });

  it("imports remote note C on phone after desktop updated appData file to A+B+C", async () => {
    const noteA = createNote({ id: "a", title: "A", body: "shared A" });
    const noteB = createNote({ id: "b", title: "B", body: "phone B" });
    const noteC = createNote({ id: "c", title: "C", body: "desktop C" });
    const repository = createRepository([noteA, noteB]);
    const fetchImpl = async (url) => {
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-phone", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-phone?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [noteA, noteB, noteC] });
      }
      if (String(url).includes("upload/drive/v3/files/remote-file-phone?uploadType=multipart")) {
        return jsonResponse({ id: "remote-file-phone" });
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
    assert.equal(result.action, "merged");
    assert.deepEqual(
      repository.getNotes().map((note) => note.id).sort(),
      ["a", "b", "c"],
    );
    assert.match(result.message, /scalono/i);
  });

  it("prefers the newer version when updatedAt differs", async () => {
    const localOlder = createNote({
      id: "same-id",
      title: "Older local",
      body: "older",
      createdAt: "2026-05-18T10:00:00.000Z",
      updatedAt: "2026-05-18T10:05:00.000Z",
    });
    const remoteNewer = createNote({
      id: "same-id",
      title: "Newer remote",
      body: "newer",
      createdAt: "2026-05-18T10:00:00.000Z",
      updatedAt: "2026-05-18T10:10:00.000Z",
    });
    const repository = createRepository([localOlder]);
    const fetchImpl = async (url) => {
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-4", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-4?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [remoteNewer] });
      }
      if (String(url).includes("upload/drive/v3/files/remote-file-4?uploadType=multipart")) {
        return jsonResponse({ id: "remote-file-4" });
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
    assert.equal(repository.getNotes()[0].title, "Newer remote");
  });

  it("creates a conflict copy when updatedAt matches but content differs", async () => {
    const localNote = createNote({
      id: "same-id",
      title: "Local title",
      body: "local body",
      createdAt: "2026-05-18T10:00:00.000Z",
      updatedAt: "2026-05-18T10:10:00.000Z",
    });
    const remoteNote = createNote({
      id: "same-id",
      title: "Remote title",
      body: "remote body",
      createdAt: "2026-05-18T10:00:00.000Z",
      updatedAt: "2026-05-18T10:10:00.000Z",
    });
    const repository = createRepository([localNote]);
    const fetchImpl = async (url) => {
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-5", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-5?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [remoteNote] });
      }
      if (String(url).includes("upload/drive/v3/files/remote-file-5?uploadType=multipart")) {
        return jsonResponse({ id: "remote-file-5" });
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
    assert.equal(repository.getNotes().length, 2);
    const conflictCopy = repository.getNotes().find((note) => note.id !== "same-id");
    assert.ok(conflictCopy);
    assert.match(conflictCopy.title, /\(konflikt\)/i);
    assert.equal(repository.getNotes().find((note) => note.id === "same-id").title, "Local title");
  });

  it("lets newer deletion win over older active note", async () => {
    const localActive = createNote({
      id: "same-id",
      title: "Active local",
      body: "still here",
      createdAt: "2026-05-18T10:00:00.000Z",
      updatedAt: "2026-05-18T10:05:00.000Z",
      deleted: false,
    });
    const remoteDeleted = createNote({
      id: "same-id",
      title: "Deleted remote",
      body: "gone",
      createdAt: "2026-05-18T10:00:00.000Z",
      updatedAt: "2026-05-18T10:12:00.000Z",
      deleted: true,
      deletedAt: "2026-05-18T10:12:00.000Z",
    });
    const repository = createRepository([localActive]);
    const fetchImpl = async (url) => {
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-6", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-6?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [remoteDeleted] });
      }
      if (String(url).includes("upload/drive/v3/files/remote-file-6?uploadType=multipart")) {
        return jsonResponse({ id: "remote-file-6" });
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
    assert.equal(repository.getNotes()[0].deleted, true);
    assert.equal(repository.getNotes()[0].deletedAt, "2026-05-18T10:12:00.000Z");
  });

  it("keeps local notes and uploads them when remote is empty", async () => {
    const note = createNote({ title: "Local only", body: "persist me" });
    const repository = createRepository([note]);
    const requests = [];
    const fetchImpl = async (url, options = {}) => {
      requests.push({ url, options });
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [{ id: "remote-file-7", name: "notes-sync.json" }] });
      }
      if (String(url).includes("/drive/v3/files/remote-file-7?alt=media")) {
        return jsonResponse({ app: "Notes", version: 1, notes: [] });
      }
      if (String(url).includes("upload/drive/v3/files/remote-file-7?uploadType=multipart")) {
        return jsonResponse({ id: "remote-file-7" });
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
    assert.match(String(requests.at(-1).options.body), /Local only/);
  });

  it("publishes final saved status after sync instead of leaving UI at syncing", async () => {
    const statuses = [];
    const note = createNote({ title: "Local", body: "Only local note" });
    const repository = createRepository([note]);
    const fetchImpl = async (url) => {
      if (String(url).includes("/drive/v3/files?")) {
        return jsonResponse({ files: [] });
      }
      if (String(url).includes("upload/drive/v3/files?uploadType=multipart")) {
        return jsonResponse({ id: "remote-file-status" });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const sync = new SyncService((payload) => statuses.push(payload.syncStatus), {
      repository,
      googleAuth: new FakeGoogleAuth(),
      fetchImpl,
    });

    const result = await sync.syncNow();

    assert.equal(result.syncStatus, "saved");
    assert.equal(statuses.at(-1), "saved");
    assert.notEqual(statuses.at(-1), "syncing");
  });
});
