export function exportNotes(notes) {
  const payload = {
    app: "Notes",
    exportedAt: new Date().toISOString(),
    version: 1,
    notes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `notes-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function readImportedNotes(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.notes)) return parsed.notes;
  throw new Error("Plik JSON nie zawiera tablicy notatek.");
}
