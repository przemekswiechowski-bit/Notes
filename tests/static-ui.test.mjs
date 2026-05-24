import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("static UI files", () => {
  it("keeps Polish labels in index.html encoded as UTF-8", () => {
    const html = readFileSync("index.html", "utf8");

    for (const text of [
      "Pokaż menu",
      "Przełącz tryb jasny lub ciemny",
      "Połącz Google",
      "Odłącz Google",
      "Utwórz notatkę",
      "Tytuł",
      "Treść notatki",
      "Przypięte",
      "Domyślny",
      "Róż",
      "Mięta",
      "Zieleń",
      "Własny",
      "Usuń",
      "znaków",
    ]) {
      assert.equal(html.includes(text), true, `Missing UTF-8 text: ${text}`);
    }

    assert.equal(/[ÃÂ�]|Ä[^>\s"]|Ĺ[^>\s"]/.test(html), false);
  });

  it("keeps Polish user-facing JavaScript messages encoded as UTF-8", () => {
    const sources = [
      readFileSync("src/syncService.js", "utf8"),
      readFileSync("src/trashActions.js", "utf8"),
      readFileSync("src/core.js", "utf8"),
    ].join("\n");

    for (const text of [
      "Google połączone.",
      "Przywrócono połączenie z Google.",
      "Połącz Google, aby synchronizować notatki.",
      "Lokalne repozytorium notatek nie jest dostępne.",
      "Nie udało się zsynchronizować notatek z Google Drive.",
      "Lokalne zmiany gotowe do ręcznej synchronizacji.",
      "Google: błąd logowania",
      "Google: połącz ponownie",
      "Sync: błąd",
      "Kosz jest już pusty.",
      "Opróżniono kosz. Usunięto",
      "Bez tytułu",
    ]) {
      assert.equal(sources.includes(text), true, `Missing UTF-8 text: ${text}`);
    }

    assert.equal(/[ÃÂ�]|Ă.|Ä[^>\s"]|Ĺ[^>\s"]/.test(sources), false);
  });

  it("keeps the destructive confirm button readable on hover", () => {
    const css = readFileSync("styles.css", "utf8");

    assert.match(css, /\.confirm-actions\s+\.danger-button:hover\s*\{[^}]*background:\s*#8c1d18;[^}]*color:\s*#fff;/s);
  });
});
