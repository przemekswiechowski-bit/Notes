export function getTrashNotes(notes = []) {
  return notes.filter((note) => note?.deleted);
}

export async function emptyTrash({ notes, repository, confirm, sync, showToast } = {}) {
  const trashNotes = getTrashNotes(notes);
  if (trashNotes.length === 0) {
    showToast?.("Kosz jest już pusty.");
    return { ok: false, removed: 0, reason: "empty" };
  }

  const confirmed = await confirm?.(trashNotes.length);
  if (!confirmed) {
    return { ok: false, removed: 0, reason: "cancelled" };
  }

  await Promise.all(trashNotes.map((note) => repository.removeForever(note)));
  await sync?.schedule?.();
  showToast?.(`Opróżniono kosz. Usunięto ${trashNotes.length} notatek.`);
  return { ok: true, removed: trashNotes.length };
}
