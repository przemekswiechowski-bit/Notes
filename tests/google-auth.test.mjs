import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GoogleAuth } from "../src/googleAuth.js";

describe("google auth scaffold", () => {
  it("stays safe when client id is missing", async () => {
    const auth = new GoogleAuth({ clientId: "" });
    const result = await auth.connect();

    assert.equal(auth.getStatus(), "not_configured");
    assert.equal(result.ok, false);
    assert.match(result.message, /Client ID/i);
  });

  it("can silently reconnect when GIS returns a token without prompting", async () => {
    const requests = [];
    globalThis.google = {
      accounts: {
        oauth2: {
          initTokenClient(options) {
            return {
              callback: options.callback,
              error_callback: options.error_callback,
              requestAccessToken(request = {}) {
                requests.push(request);
                this.callback({
                  access_token: "silent-token",
                  expires_in: 3600,
                  token_type: "Bearer",
                });
              },
            };
          },
        },
      },
    };

    const auth = new GoogleAuth({ clientId: "client-id" });
    const result = await auth.reconnectSilently();

    assert.equal(result.ok, true);
    assert.equal(auth.getStatus(), "authorized");
    assert.equal(auth.getAccessToken(), "silent-token");
    assert.deepEqual(requests, [{ prompt: "" }]);
  });

  it("falls back to signed out when silent reconnect cannot get a token", async () => {
    const requests = [];
    globalThis.google = {
      accounts: {
        oauth2: {
          initTokenClient(options) {
            return {
              callback: options.callback,
              error_callback: options.error_callback,
              requestAccessToken(request = {}) {
                requests.push(request);
                this.callback({
                  error: "interaction_required",
                  error_description: "No active Google session",
                });
              },
            };
          },
        },
      },
    };

    const auth = new GoogleAuth({ clientId: "client-id" });
    const result = await auth.reconnectSilently();

    assert.equal(result.ok, false);
    assert.equal(result.silent, true);
    assert.equal(auth.getStatus(), "signed_out");
    assert.equal(auth.getAccessToken(), "");
    assert.deepEqual(requests, [{ prompt: "" }]);
  });
});
