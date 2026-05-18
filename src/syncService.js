import { APP_CONFIG } from "./config.js?v=20260518-auth-reload-status";
import { GoogleAuth } from "./googleAuth.js?v=20260518-auth-reload-status";

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";
const SYNC_FILE_NAME = "notes-sync.json";
const AUTH_CONNECTED_STORAGE_KEY = "googleAuthWasConnected";

export class SyncService {
  constructor(onStatus = () => {}, {
    repository = null,
    googleAuth = null,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    fileName = SYNC_FILE_NAME,
    storage = createStorageAdapter(),
  } = {}) {
    this.onStatus = onStatus;
    this.repository = repository;
    this.fetchImpl = fetchImpl;
    this.fileName = fileName;
    this.storage = storage;
    this.syncStatus = "local";
    this.authStatus = "not_configured";
    this.lastError = null;
    this.lastMessage = "";
    this.authWasConnected = this.storage.get(AUTH_CONNECTED_STORAGE_KEY) === "true";
    this.googleAuth = googleAuth || new GoogleAuth({
      clientId: APP_CONFIG.GOOGLE_CLIENT_ID,
      scope: APP_CONFIG.GOOGLE_DRIVE_SCOPE,
      onStatus: (status, meta = {}) => {
        this.authStatus = status;
        this.lastError = meta.error || null;
        if (status === "authorized" && this.syncStatus === "local") {
          this.syncStatus = "ready";
        }
        if (status === "authorized") {
          this.authWasConnected = true;
          this.storage.set(AUTH_CONNECTED_STORAGE_KEY, "true");
        }
        if (status === "signed_out" || status === "not_configured") {
          this.syncStatus = "local";
        }
        this.publish();
      },
    });
    this.authStatus = this.googleAuth.getStatus();
    if (this.authStatus === "authorized") {
      this.syncStatus = "ready";
    }
    this.publish();
  }

  getSyncStatus() {
    const configured = this.googleAuth?.isConfigured?.() ?? false;
    const connected = this.authStatus === "authorized";
    return {
      syncStatus: this.syncStatus,
      authStatus: this.authStatus,
      configured,
      connected,
      label: this.getGoogleStatusLabel(configured),
      googleLabel: this.getGoogleStatusLabel(configured),
      syncLabel: this.getDriveStatusLabel({ configured, connected }),
      error: this.lastError?.message || "",
      message: this.lastMessage,
    };
  }

  setSyncStatus(status, message = "") {
    this.syncStatus = status;
    this.lastMessage = message;
    return this.publish();
  }

  async connectGoogle() {
    const result = await this.googleAuth.connect();
    this.authStatus = this.googleAuth.getStatus();
    if (result.ok) {
      this.lastError = null;
      this.authWasConnected = true;
      this.storage.set(AUTH_CONNECTED_STORAGE_KEY, "true");
      this.syncStatus = "ready";
      this.lastMessage = "Google połączone.";
    }
    return {
      ...result,
      ...this.getSyncStatus(),
    };
  }

  disconnectGoogle() {
    const result = this.googleAuth.disconnect();
    this.authStatus = this.googleAuth.getStatus();
    this.lastError = null;
    this.authWasConnected = false;
    this.storage.remove(AUTH_CONNECTED_STORAGE_KEY);
    this.syncStatus = "local";
    this.lastMessage = "Google odłączone.";
    return {
      ...result,
      ...this.getSyncStatus(),
    };
  }

  async syncNow() {
    if (!this.googleAuth?.isConfigured?.()) {
      this.lastMessage = "Brak Google Client ID w konfiguracji.";
      return {
        ok: false,
        ...this.getSyncStatus(),
        message: this.lastMessage,
      };
    }

    if (this.authStatus !== "authorized" || !this.googleAuth.getAccessToken()) {
      this.syncStatus = "error";
      this.lastMessage = "Połącz Google, aby synchronizować notatki.";
      return this.publishResult(false);
    }

    if (!this.repository?.list || !this.repository?.replaceAll) {
      this.syncStatus = "error";
      this.lastMessage = "Lokalne repozytorium notatek nie jest dostępne.";
      return this.publishResult(false);
    }

    if (typeof this.fetchImpl !== "function") {
      this.syncStatus = "error";
      this.lastMessage = "Brak fetch API potrzebnego do synchronizacji Drive.";
      return this.publishResult(false);
    }

    this.syncStatus = "syncing";
    this.lastError = null;
    this.lastMessage = "Trwa synchronizacja z Google Drive...";
    this.publish();

    try {
      const token = this.googleAuth.getAccessToken();
      const localNotes = await this.repository.list();
      const remoteFile = await this.findSyncFile(token);

      if (!remoteFile) {
        await this.createSyncFile(token, localNotes);
        this.syncStatus = "saved";
        this.lastMessage = "Utworzono plik sync i zapisano notatki do Google Drive.";
        return this.publishResult(true, { action: "uploaded" });
      }

      const remotePayload = await this.downloadSyncFile(token, remoteFile.id);
      const remoteNotes = extractNotes(remotePayload);
      const localEmpty = localNotes.length === 0;
      const remoteEmpty = remoteNotes.length === 0;

      if (remoteEmpty) {
        await this.updateSyncFile(token, remoteFile.id, localNotes);
        this.syncStatus = "saved";
        this.lastMessage = "Zapisano lokalne notatki do Google Drive.";
        return this.publishResult(true, { action: "uploaded" });
      }

      if (localEmpty) {
        await this.repository.replaceAll(remoteNotes);
        this.syncStatus = "pulled";
        this.lastMessage = "Pobrano notatki z Google Drive do lokalnej bazy.";
        return this.publishResult(true, { action: "downloaded", imported: true });
      }

      if (notesMatch(localNotes, remoteNotes)) {
        this.syncStatus = "saved";
        this.lastMessage = "Lokalne i zdalne notatki są już zgodne.";
        return this.publishResult(true, { action: "noop" });
      }

      this.syncStatus = "conflict";
      this.lastMessage = "Konflikt sync: lokalne i zdalne notatki mają dane. Merge będzie w następnym etapie.";
      return this.publishResult(false, { action: "conflict" });
    } catch (error) {
      this.lastError = error;
      this.syncStatus = "error";
      this.lastMessage = error?.message || "Nie udało się zsynchronizować notatek z Google Drive.";
      return this.publishResult(false);
    }
  }

  async schedule() {
    this.lastError = null;
    this.syncStatus = this.authStatus === "authorized" ? "ready" : "local";
    this.lastMessage = this.authStatus === "authorized"
      ? "Lokalne zmiany gotowe do ręcznej synchronizacji."
      : "Notatki zapisano lokalnie.";
    return this.publish();
  }

  publish() {
    const payload = this.getSyncStatus();
    this.onStatus(payload);
    return payload;
  }

  publishResult(ok, extra = {}) {
    return {
      ok,
      ...this.getSyncStatus(),
      ...extra,
      message: this.lastMessage,
    };
  }

  getGoogleStatusLabel(configured = this.googleAuth?.isConfigured?.() ?? false) {
    if (!configured) return "Google: brak konfiguracji";
    if (this.authStatus === "authorizing") return "Google: logowanie...";
    if (this.authStatus === "authorized") return "Google: zalogowany";
    if (this.authStatus === "error") return "Google: błąd logowania";
    if (this.authWasConnected) return "Google: połącz ponownie";
    return "Google: niezalogowany";
  }

  getDriveStatusLabel({ configured = this.googleAuth?.isConfigured?.() ?? false, connected = this.authStatus === "authorized" } = {}) {
    if (!configured) return "Sync: brak konfiguracji";
    if (this.syncStatus === "syncing") return "Sync: trwa";
    if (this.syncStatus === "saved") return "Sync: zapisano";
    if (this.syncStatus === "pulled") return "Sync: pobrano";
    if (this.syncStatus === "conflict") return "Sync: konflikt";
    if (this.syncStatus === "error") return "Sync: błąd";
    if (!connected) return "Sync: gotowy lokalnie";
    return "Sync: gotowy";
  }

  async findSyncFile(token) {
    const query = new URLSearchParams({
      spaces: "appDataFolder",
      q: `name='${this.fileName}' and trashed=false`,
      fields: "files(id,name,modifiedTime,size)",
      pageSize: "1",
    });
    const response = await this.driveJsonRequest(
      `${DRIVE_FILES_ENDPOINT}?${query.toString()}`,
      { token },
    );
    return response.files?.[0] || null;
  }

  async downloadSyncFile(token, fileId) {
    return this.driveJsonRequest(
      `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`,
      { token },
    );
  }

  async createSyncFile(token, notes) {
    const payload = buildSyncPayload(notes);
    const metadata = {
      name: this.fileName,
      parents: ["appDataFolder"],
      mimeType: "application/json",
    };
    return this.multipartUpload({
      token,
      method: "POST",
      url: `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart`,
      metadata,
      payload,
    });
  }

  async updateSyncFile(token, fileId, notes) {
    const payload = buildSyncPayload(notes);
    return this.multipartUpload({
      token,
      method: "PATCH",
      url: `${DRIVE_UPLOAD_ENDPOINT}/${encodeURIComponent(fileId)}?uploadType=multipart`,
      metadata: { mimeType: "application/json" },
      payload,
    });
  }

  async multipartUpload({ token, method, url, metadata, payload }) {
    const boundary = `notes-boundary-${Date.now()}`;
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(payload),
      `--${boundary}--`,
      "",
    ].join("\r\n");

    return this.driveJsonRequest(url, {
      method,
      token,
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
  }

  async driveJsonRequest(url, { token, method = "GET", headers = {}, body } = {}) {
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...headers,
      },
      body,
    });

    if (!response.ok) {
      const message = await readResponseMessage(response);
      throw new Error(message || `Google Drive API error (${response.status}).`);
    }

    return response.json();
  }
}

function buildSyncPayload(notes) {
  return {
    app: "Notes",
    syncedAt: new Date().toISOString(),
    version: 1,
    notes,
  };
}

function extractNotes(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.notes)) return payload.notes;
  return [];
}

function notesMatch(localNotes, remoteNotes) {
  return stableStringifyNotes(localNotes) === stableStringifyNotes(remoteNotes);
}

function stableStringifyNotes(notes) {
  return JSON.stringify([...notes]
    .map((note) => normalizeComparableNote(note))
    .sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

function normalizeComparableNote(note) {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    color: note.color,
    labels: Array.isArray(note.labels) ? [...note.labels].sort() : [],
    pinned: Boolean(note.pinned),
    archived: Boolean(note.archived),
    deleted: Boolean(note.deleted),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt,
    order: note.order,
    version: note.version,
    dirty: Boolean(note.dirty),
    syncStatus: note.syncStatus,
  };
}

async function readResponseMessage(response) {
  try {
    const parsed = await response.json();
    return parsed?.error?.message || parsed?.message || "";
  } catch {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }
}

function createStorageAdapter() {
  return {
    get(key) {
      try {
        return globalThis.localStorage?.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    set(key, value) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // ignore storage failures
      }
    },
    remove(key) {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // ignore storage failures
      }
    },
  };
}
