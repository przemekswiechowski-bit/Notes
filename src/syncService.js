import { APP_CONFIG } from "./config.js?v=20260518-google-auth-scaffold";
import { GoogleAuth } from "./googleAuth.js?v=20260518-google-auth-scaffold";

export class SyncService {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.syncStatus = "local";
    this.authStatus = "not_configured";
    this.lastError = null;
    this.googleAuth = new GoogleAuth({
      clientId: APP_CONFIG.GOOGLE_CLIENT_ID,
      scope: APP_CONFIG.GOOGLE_DRIVE_SCOPE,
      onStatus: (status, meta = {}) => {
        this.authStatus = status;
        this.lastError = meta.error || null;
        this.publish();
      },
    });
    this.authStatus = this.googleAuth.getStatus();
    this.publish();
  }

  getSyncStatus() {
    const configured = this.googleAuth?.isConfigured?.() ?? false;
    return {
      syncStatus: this.syncStatus,
      authStatus: this.authStatus,
      configured,
      connected: this.authStatus === "authorized",
      label: this.getStatusLabel(configured),
      error: this.lastError?.message || "",
    };
  }

  setSyncStatus(status) {
    this.syncStatus = status;
    return this.publish();
  }

  async connectGoogle() {
    const result = await this.googleAuth.connect();
    return {
      ...result,
      ...this.getSyncStatus(),
    };
  }

  disconnectGoogle() {
    const result = this.googleAuth.disconnect();
    return {
      ...result,
      ...this.getSyncStatus(),
    };
  }

  async syncNow() {
    return {
      ok: false,
      ...this.getSyncStatus(),
      message: "Drive sync not implemented yet.",
    };
  }

  async schedule() {
    this.setSyncStatus("local");
    return this.getSyncStatus();
  }

  publish() {
    const payload = this.getSyncStatus();
    this.onStatus(payload);
    return payload;
  }

  getStatusLabel(configured = this.googleAuth?.isConfigured?.() ?? false) {
    if (!configured) return "Google: brak konfiguracji";
    if (this.authStatus === "authorizing") return "Google: logowanie...";
    if (this.authStatus === "authorized") return "Google: zalogowany";
    if (this.authStatus === "error") return "Google: blad logowania";
    return "Google: niezalogowany";
  }
}
