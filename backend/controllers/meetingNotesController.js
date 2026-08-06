import Joi from "joi";
import {
  listNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  listNoteChanges,
} from "../services/meetingNotesService.js";

export const noteQuerySchema = Joi.object({
  q: Joi.string().allow("", null).optional(),
});

export const noteCreateSchema = Joi.object({
  title: Joi.string().trim().min(1).required(),
  contentHtml: Joi.string().allow("", null).default(""),
});

export const noteUpdateSchema = Joi.object({
  title: Joi.string().trim().min(1).optional(),
  contentHtml: Joi.string().allow("", null).optional(),
  summary: Joi.string().allow("", null).optional(),
});

export function getNotes(req, res, next) {
  try {
    const notes = listNotes({ query: req.query.q });
    res.json({ data: notes });
  } catch (error) {
    next(error);
  }
}

export function getSingleNote(req, res, next) {
  try {
    const noteId = Number(req.params.id);
    const note = getNote(noteId);
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json({ data: note });
  } catch (error) {
    next(error);
  }
}

export function postNote(req, res, next) {
  try {
    const note = createNote(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: note });
  } catch (error) {
    next(error);
  }
}

export function patchNote(req, res, next) {
  try {
    const noteId = Number(req.params.id);
    const updated = updateNote(noteId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) return res.status(404).json({ message: "Note not found" });
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
}

export function deleteNoteRoute(req, res, next) {
  try {
    const noteId = Number(req.params.id);
    const ok = deleteNote(noteId, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!ok) return res.status(404).json({ message: "Note not found" });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export function getNoteChanges(req, res, next) {
  try {
    const noteId = Number(req.params.id);
    const items = listNoteChanges(noteId);
    res.json({ data: items });
  } catch (error) {
    next(error);
  }
}

