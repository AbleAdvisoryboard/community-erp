import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import {
  firstRunSetupSchema,
  handleCompleteFirstRunSetup,
  handleSetupStatus,
} from "../controllers/setupController.js";

const router = Router();

router.get("/status", handleSetupStatus);
router.post("/", validateBody(firstRunSetupSchema), handleCompleteFirstRunSetup);

export default router;
