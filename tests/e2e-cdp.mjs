import assert from "node:assert/strict";

const CDP = "http://127.0.0.1:9333";
const ORIGIN = "http://127.0.0.1:4173";
const title = "E2E 30000 znakow";
const body = "0123456789".repeat(3000);
const report = [];

async function fetchJsonWithRetry(url, label) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Could not read ${label}: ${lastError?.message || "unknown error"}`);
}

if (process.env.NOTES_E2E_ISOLATED_PROFILE !== "1") {
  throw new Error("Refusing to run E2E without NOTES_E2E_ISOLATED_PROFILE=1. Use tests/run-e2e.ps1.");
}

const tabs = await fetchJsonWithRetry(`${CDP}/json`, "Chrome tabs");
const tab = tabs.find((item) => item.url.includes("127.0.0.1:4173")) || tabs[0];
assert.ok(tab?.webSocketDebuggerUrl, "Chrome DevTools tab not found");

const socket = new WebSocket(tab.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++seq;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function mouseMove(x, y) {
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
    buttons: 0,
  });
}

async function mouseClick(x, y) {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

async function evaluate(functionSource, args = {}) {
  const result = await send("Runtime.evaluate", {
    expression: `(${functionSource})(${JSON.stringify(args)})`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function reload() {
  await send("Page.reload", { ignoreCache: true });
  await sleep(900);
  await evaluate(async function waitReady() {
    const waitFor = async (predicate, timeout = 5000) => {
      const start = performance.now();
      while (performance.now() - start < timeout) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("App not ready after reload");
    };
    return waitFor(() => document.querySelector("#quickBody"));
  });
}

async function createNoteViaUi({ title, body }) {
  await evaluate(async function createNote({ title, body }) {
    const waitFor = async (predicate, timeout = 5000) => {
      const start = performance.now();
      while (performance.now() - start < timeout) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Timeout creating note: ${title}`);
    };
    document.querySelector("#quickTitle").focus();
    document.querySelector("#quickTitle").value = title;
    document.querySelector("#quickTitle").dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#quickBody").value = body;
    document.querySelector("#quickBody").dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#quickAdd").click();
    await waitFor(() => [...document.querySelectorAll(".note-card")].some((card) => card.textContent.includes(title)));
    return true;
  }, { title, body });
}

function ok(message) {
  report.push(`OK: ${message}`);
}

await send("Page.enable");
await send("Runtime.enable");
try {
  const commandLine = await send("Browser.getBrowserCommandLine");
  const joined = commandLine.arguments.join(" ");
  assert.match(joined, /notes-e2e-profile/i, "E2E must run in a notes-e2e-profile user-data-dir");
  assert.match(joined, /--headless/i, "E2E must run in a headless test browser");
} catch (error) {
  throw new Error(`Could not verify isolated Chrome profile: ${error.message}`);
}
await send("Browser.grantPermissions", {
  origin: ORIGIN,
  permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
});

await send("Page.navigate", { url: `${ORIGIN}/` });
await sleep(900);

await evaluate(async function clearDb() {
  const waitFor = async (predicate, timeout = 5000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      if (predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("App not ready");
  };
  await waitFor(() => document.querySelector("#quickBody"));
  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const db = await openDb();
  const tx = db.transaction("notes", "readwrite");
  tx.objectStore("notes").clear();
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return true;
});
await reload();

await evaluate(async function createLongNote({ title, body }) {
  const waitFor = async (predicate, timeout = 5000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Timeout creating note");
  };
  document.querySelector("#quickTitle").focus();
  document.querySelector("#quickTitle").value = title;
  document.querySelector("#quickTitle").dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#quickBody").value = body;
  document.querySelector("#quickBody").dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#quickAdd").click();
  await waitFor(() => [...document.querySelectorAll(".note-card")].some((card) => card.textContent.includes(title)));
  return true;
}, { title, body });
ok("utworzono notatkę z 30 000 znaków przez UI");

let state = await evaluate(async function readState() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
});
assert.equal(state.length, 1);
assert.equal(state[0].body.length, 30000);
ok("IndexedDB ma jedną notatkę i pełne 30 000 znaków");

await reload();
state = await evaluate(async function verifyAfterReload({ title }) {
  const waitFor = async (predicate, timeout = 5000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("note not visible after reload");
  };
  await waitFor(() => [...document.querySelectorAll(".note-card")].some((card) => card.textContent.includes(title)));
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
}, { title });
assert.equal(state[0].body.length, 30000);
ok("po odświeżeniu notatka została i ma pełną treść");

const copiedLength = await evaluate(async function openScrollCopy({ title }) {
  const waitFor = async (predicate, timeout = 5000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("modal/copy timeout");
  };
  const card = [...document.querySelectorAll(".note-card")].find((item) => item.textContent.includes(title));
  card.click();
  const editor = await waitFor(() => !document.querySelector("#editorBackdrop").classList.contains("hidden") && document.querySelector("#editorBody"));
  editor.scrollTop = editor.scrollHeight;
  await new Promise((resolve) => setTimeout(resolve, 150));
  document.querySelector("#editorCopy").click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const copied = await navigator.clipboard.readText();
  return { length: copied.length, scrollTop: editor.scrollTop, scrollable: editor.scrollHeight > editor.clientHeight };
}, { title });
assert.equal(copiedLength.length, 30000);
assert.ok(copiedLength.scrollTop > 0 || !copiedLength.scrollable);
ok("modal otwiera się, przewija, a kopiowanie daje pełne 30 000 znaków");

await evaluate(async function changeColorAndClose() {
  document.querySelector('[data-editor-color="teal"]').click();
  await new Promise((resolve) => setTimeout(resolve, 600));
  document.querySelector("#editorClose").click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  return true;
});
state = await evaluate(async function readNotes() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
});
assert.equal(state[0].color, "teal");
ok("kolor zmieniony na teal");

await reload();
state = await evaluate(async function readNotesAfterColorReload() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
});
assert.equal(state[0].color, "teal");
ok("kolor został po odświeżeniu");

await createNoteViaUi({ title: "Menu target A", body: "KrĂłtka treĹ›Ä‡ A" });
await createNoteViaUi({ title: "Menu target B", body: "KrĂłtka treĹ›Ä‡ B" });

const menuTargetResult = await evaluate(async function verifyMenuTargeting() {
  const waitFor = async (predicate, timeout = 5000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("menu target verification timeout");
  };

  const findCard = (title) => [...document.querySelectorAll(".note-card")].find((item) => item.textContent.includes(title));
  const cardA = await waitFor(() => findCard("Menu target A"));
  const cardB = await waitFor(() => findCard("Menu target B"));

  cardA.querySelector("[data-menu-toggle]").click();
  const menuA = await waitFor(() => !cardA.querySelector("[data-card-menu]").classList.contains("hidden") && cardA.querySelector("[data-card-menu]"));

  cardB.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  cardB.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 4, clientY: 4 }));
  await new Promise((resolve) => setTimeout(resolve, 120));

  const mintButton = [...menuA.querySelectorAll("[data-action]")].find((item) => item.dataset.action === "color:mint");
  if (!mintButton) throw new Error("Missing mint action in card menu");
  mintButton.click();
  await new Promise((resolve) => setTimeout(resolve, 500));

  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();

  const noteA = notes.find((item) => item.title === "Menu target A");
  const noteB = notes.find((item) => item.title === "Menu target B");
  const activeHints = [...document.querySelectorAll(".note-select-hint")].filter((item) => getComputedStyle(item).opacity !== "0").length;

  return {
    colorA: noteA?.color,
    colorB: noteB?.color,
    activeHints,
  };
});

const pointerTargets = await evaluate(async function readPointerTargets() {
  const waitFor = async (predicate, timeout = 5000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("pointer target timeout");
  };
  const findCard = (title) => [...document.querySelectorAll(".note-card")].find((item) => item.textContent.includes(title));
  const cardA = await waitFor(() => findCard("Menu target A"));
  const cardB = await waitFor(() => findCard("Menu target B"));
  const toggleRect = cardA.querySelector("[data-menu-toggle]").getBoundingClientRect();
  const cardBRect = cardB.getBoundingClientRect();
  return {
    toggleX: toggleRect.left + toggleRect.width / 2,
    toggleY: toggleRect.top + toggleRect.height / 2,
    hoverX: cardBRect.left + cardBRect.width / 2,
    hoverY: cardBRect.top + Math.min(24, cardBRect.height / 2),
  };
});

await mouseClick(pointerTargets.toggleX, pointerTargets.toggleY);
await sleep(250);
await mouseMove(pointerTargets.hoverX, pointerTargets.hoverY);
await sleep(150);

const swatchTarget = await evaluate(async function readSwatchTarget() {
  const cardA = [...document.querySelectorAll(".note-card")].find((item) => item.textContent.includes("Menu target A"));
  const menuA = cardA?.querySelector("[data-card-menu]");
  const mintButton = [...(menuA?.querySelectorAll("[data-action]") || [])].find((item) => item.dataset.action === "color:mint");
  if (!mintButton) throw new Error("Missing mint button for pointer test");
  const rect = mintButton.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  return {
    x,
    y,
    hitAction: hit?.closest("[data-action]")?.dataset.action || null,
    hitCardId: hit?.closest(".note-card")?.dataset.id || null,
    menuCardId: cardA?.dataset.id || null,
  };
});

await mouseClick(swatchTarget.x, swatchTarget.y);
await sleep(500);

const pointerColorState = await evaluate(async function readPointerColorState() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return {
    colorA: notes.find((item) => item.title === "Menu target A")?.color,
    colorB: notes.find((item) => item.title === "Menu target B")?.color,
  };
});

assert.equal(menuTargetResult.colorA, "mint");
assert.equal(menuTargetResult.colorB, "default");
assert.equal(menuTargetResult.activeHints <= 1, true);
assert.equal(pointerColorState.colorA, "mint");
assert.equal(pointerColorState.colorB, "default");
ok("zmiana koloru z menu trafia tylko do wĹ‚aĹ›ciciela menu i nie aktywuje wielu kart");

await evaluate(async function cleanupMenuTargetNotes() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");
  const getAll = store.getAll();
  const notes = await new Promise((resolve, reject) => {
    getAll.onsuccess = () => resolve(getAll.result);
    getAll.onerror = () => reject(getAll.error);
  });
  notes
    .filter((note) => note.title === "Menu target A" || note.title === "Menu target B")
    .forEach((note) => store.delete(note.id));
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return true;
});
await reload();

async function menuAction(actionText, viewSelector = null) {
  await evaluate(async function doMenuAction({ title, actionText, viewSelector }) {
    const waitFor = async (predicate, timeout = 5000) => {
      const start = performance.now();
      while (performance.now() - start < timeout) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`menu action timeout: ${actionText}`);
    };
    if (viewSelector) {
      document.querySelector(viewSelector).click();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const card = await waitFor(() => [...document.querySelectorAll(".note-card")].find((item) => item.textContent.includes(title)));
    card.querySelector("[data-menu-toggle]").click();
    const menu = await waitFor(() => !card.querySelector("[data-card-menu]").classList.contains("hidden") && card.querySelector("[data-card-menu]"));
    const button = [...menu.querySelectorAll("button")].find((item) => item.textContent.trim() === actionText);
    if (!button) throw new Error(`Missing action: ${actionText}`);
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    return true;
  }, { title, actionText, viewSelector });
}

await menuAction("Archiwizuj");
state = await evaluate(async function readArchiveState() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
});
assert.equal(state[0].archived, true);
assert.equal(state[0].deleted, false);
ok("notatka zarchiwizowana");

await menuAction("Przywróć z archiwum", '[data-view="archive"]');
state = await evaluate(async function readUnarchivedState() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
});
assert.equal(state[0].archived, false);
ok("notatka przywrócona z archiwum");

await menuAction("Usuń", '[data-view="notes"]');
state = await evaluate(async function readTrashState() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
});
assert.equal(state[0].deleted, true);
assert.equal(state[0].archived, false);
ok("notatka przeniesiona do kosza");

await menuAction("Przywróć", '[data-view="trash"]');
state = await evaluate(async function readRestoredState() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
});
assert.equal(state[0].deleted, false);
ok("notatka przywrócona z kosza");

const exportedText = await evaluate(async function exportJson({ title }) {
  let exported = "";
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    blob.text().then((text) => { exported = text; });
    return originalCreateObjectURL(blob);
  };
  document.querySelector("#exportButton").click();
  const start = performance.now();
  while (performance.now() - start < 5000) {
    if (exported.includes(title)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  URL.createObjectURL = originalCreateObjectURL;
  return exported;
}, { title });
const exported = JSON.parse(exportedText);
assert.equal(exported.notes[0].body.length, 30000);
ok("eksport JSON zawiera pełną notatkę");

await evaluate(async function clearBeforeImport() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readwrite");
  tx.objectStore("notes").clear();
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return true;
});
await reload();
state = await evaluate(async function readEmptyState() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const tx = db.transaction("notes", "readonly");
  const req = tx.objectStore("notes").getAll();
  const notes = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return notes;
});
assert.equal(state.length, 0);
ok("baza pusta przed importem");

state = await evaluate(async function importJson({ exportedText }) {
  const input = document.querySelector("#importInput");
  const file = new File([exportedText], "notes-export.json", { type: "application/json" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  const readNotes = async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("notes-db");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction("notes", "readonly");
    const req = tx.objectStore("notes").getAll();
    const notes = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return notes;
  };
  const start = performance.now();
  let notes = [];
  while (performance.now() - start < 5000) {
    notes = await readNotes();
    if (notes.length === 1) return notes;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return notes;
}, { exportedText });
assert.equal(state.length, 1);
assert.equal(state[0].title, title);
assert.equal(state[0].body.length, 30000);
assert.equal(state[0].color, "teal");
ok("import JSON przywrócił tytuł, pełną treść i kolor");

console.log(report.join("\n"));
socket.close();
