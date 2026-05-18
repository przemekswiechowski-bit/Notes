import {
  createNote,
  mergeImportedNotes,
  moveToTrash,
  normalizeNote,
  restoreFromTrash,
  toggleArchive,
  updateNote,
} from "./core.js";
import { deleteNote, getAllNotes, putNote, putNotes } from "./db.js";

export class NotesRepository {
  async list() {
    const notes = await getAllNotes();
    return notes.map(normalizeNote);
  }

  async create(data) {
    const note = createNote(data);
    await putNote(note);
    return note;
  }

  async save(note, patch = {}) {
    const next = updateNote(note, patch);
    await putNote(next);
    return next;
  }

  async archive(note) {
    const next = toggleArchive(note, true);
    await putNote(next);
    return next;
  }

  async unarchive(note) {
    const next = toggleArchive(note, false);
    await putNote(next);
    return next;
  }

  async trash(note) {
    const next = moveToTrash(note);
    await putNote(next);
    return next;
  }

  async restore(note) {
    const next = restoreFromTrash(note);
    await putNote(next);
    return next;
  }

  async removeForever(note) {
    await deleteNote(note.id);
  }

  async replaceAll(notes) {
    await putNotes(notes.map(normalizeNote));
  }

  async importNotes(importedNotes) {
    const local = await this.list();
    const result = mergeImportedNotes(local, importedNotes);
    await putNotes(result.notes);
    return result;
  }
}
