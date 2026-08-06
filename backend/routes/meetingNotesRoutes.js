import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  noteQuerySchema,
  noteCreateSchema,
  noteUpdateSchema,
  getNotes,
  getSingleNote,
  postNote,
  patchNote,
  deleteNoteRoute,
  getNoteChanges,
} from "../controllers/meetingNotesController.js";

const router = Router();

router.use(authenticate);

router.get("/", validateQuery(noteQuerySchema), getNotes);
router.post("/", csrfProtection, validateBody(noteCreateSchema), postNote);
router.get("/:id", getSingleNote);
router.patch("/:id", csrfProtection, validateBody(noteUpdateSchema), patchNote);
router.delete("/:id", csrfProtection, deleteNoteRoute);
router.get("/:id/changes", getNoteChanges);

export default router;

