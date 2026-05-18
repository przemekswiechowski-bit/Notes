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
});
