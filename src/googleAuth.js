const GIS_SRC = "https://accounts.google.com/gsi/client";

export class GoogleAuth {
  constructor({
    clientId = "",
    scope = "https://www.googleapis.com/auth/drive.appdata",
    onStatus = () => {},
  } = {}) {
    this.clientId = String(clientId || "").trim();
    this.scope = scope;
    this.onStatus = onStatus;
    this.status = this.clientId ? "signed_out" : "not_configured";
    this.tokenResponse = null;
    this.tokenClient = null;
    this.scriptPromise = null;
    this.lastError = null;
    this.notify();
  }

  isConfigured() {
    return Boolean(this.clientId);
  }

  getStatus() {
    return this.status;
  }

  getAccessToken() {
    return this.tokenResponse?.access_token || "";
  }

  async connect() {
    if (!this.isConfigured()) {
      this.setStatus("not_configured");
      return {
        ok: false,
        status: this.status,
        message: "Brak Google Client ID w konfiguracji.",
      };
    }

    this.setStatus("authorizing");

    try {
      await this.ensureClientReady();
      const response = await new Promise((resolve, reject) => {
        this.tokenClient.callback = (tokenResponse) => {
          if (tokenResponse?.error) {
            reject(new Error(tokenResponse.error_description || tokenResponse.error));
            return;
          }
          resolve(tokenResponse);
        };
        this.tokenClient.error_callback = (error) => {
          reject(new Error(error?.message || "Google auth popup error"));
        };
        this.tokenClient.requestAccessToken({
          prompt: this.tokenResponse ? "" : "consent",
        });
      });

      this.tokenResponse = response;
      this.lastError = null;
      this.setStatus("authorized");
      return {
        ok: true,
        status: this.status,
        accessToken: this.getAccessToken(),
      };
    } catch (error) {
      this.lastError = error;
      this.setStatus("error", { error });
      return {
        ok: false,
        status: this.status,
        message: error?.message || "Nie udalo sie zalogowac do Google.",
      };
    }
  }

  disconnect() {
    const token = this.getAccessToken();
    const revoke = globalThis.google?.accounts?.oauth2?.revoke;
    if (token && typeof revoke === "function") {
      revoke(token, () => {});
    }
    this.tokenResponse = null;
    this.lastError = null;
    this.setStatus(this.isConfigured() ? "signed_out" : "not_configured");
    return {
      ok: true,
      status: this.status,
    };
  }

  async ensureClientReady() {
    await loadGoogleIdentityServicesScript();
    const initTokenClient = globalThis.google?.accounts?.oauth2?.initTokenClient;
    if (typeof initTokenClient !== "function") {
      throw new Error("Google Identity Services nie zaladowalo sie poprawnie.");
    }
    if (!this.tokenClient) {
      this.tokenClient = initTokenClient({
        client_id: this.clientId,
        scope: this.scope,
        callback: () => {},
        error_callback: () => {},
      });
    }
    return this.tokenClient;
  }

  setStatus(status, meta = {}) {
    this.status = status;
    this.notify(meta);
  }

  notify(meta = {}) {
    this.onStatus(this.status, meta);
  }
}

function loadGoogleIdentityServicesScript() {
  if (globalThis.google?.accounts?.oauth2?.initTokenClient) {
    return Promise.resolve();
  }

  if (!globalThis.document) {
    return Promise.reject(new Error("Google auth wymaga przegladarki."));
  }

  const existing = globalThis.document.querySelector(`script[src="${GIS_SRC}"]`);
  if (existing?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  if (!globalThis.__notesGoogleGisPromise) {
    globalThis.__notesGoogleGisPromise = new Promise((resolve, reject) => {
      const script = existing || globalThis.document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error("Nie udalo sie zaladowac Google Identity Services."));
      if (!existing) globalThis.document.head.append(script);
    });
  }

  return globalThis.__notesGoogleGisPromise;
}
