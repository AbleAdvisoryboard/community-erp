import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimitMiddleware from "express-rate-limit";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

import { runMigrations } from "./db/migrate.js";
import { getDb, getDbPath } from "./db/connection.js";
import { reconcileSchema } from "./db/reconcile.js";
import authRoutes from "./routes/authRoutes.js";
import crmRoutes from "./routes/crmRoutes.js";
import fundraisingRoutes from "./routes/fundraisingRoutes.js";
import financeRoutes from "./routes/financeRoutes.js";
import glRoutes from "./routes/glRoutes.js";
import donationsRoutes from "./routes/donationsRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import volunteerRoutes from "./routes/volunteerRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import communicationRoutes from "./routes/communicationRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import arRoutes from "./routes/arRoutes.js";
import apRoutes from "./routes/apRoutes.js";
import classesRoutes from "./routes/classesRoutes.js";
import periodsRoutes from "./routes/periodsRoutes.js";
import bankRoutes from "./routes/bankRoutes.js";
import calendarRoutes from "./routes/calendarRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import meetingNotesRoutes from "./routes/meetingNotesRoutes.js";
import meetkitRoutes from "./routes/meetkitRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import setupRoutes from "./routes/setupRoutes.js";
import { authenticate } from "./middleware/auth.js";
import { csrfProtection } from "./middleware/csrf.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { hasActiveAdmin } from "./services/setupService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

export function createApp(options = {}) {
  const {
    loadEnv = true,
    envPath = path.join(projectRoot, ".env"),
    runMigrations: shouldRunMigrations = true,
    initializeDb = true,
  } = options;

  if (loadEnv) {
    dotenv.config({ path: envPath });
  }

  if (shouldRunMigrations) {
    runMigrations();
    // Lightweight reconcile to ensure additive columns/indexes exist
    try { reconcileSchema(); } catch (e) { console.warn('Schema reconcile skipped:', e.message); }
  }

  if (initializeDb) {
    getDb();
  }

  const app = express();

  const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );
  app.use(morgan("dev"));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  const apiRateLimiter = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_MAX || 2000),
    standardHeaders: true,
    legacyHeaders: false,
  });

  const uploadsDir = process.env.UPLOADS_DIR || path.join(projectRoot, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  app.use("/uploads", authenticate, csrfProtection, express.static(uploadsDir));

  const frontendDir = path.join(projectRoot, "frontend");
  app.use(express.static(frontendDir));

  app.get("/", (_req, res, next) => {
    const page = hasActiveAdmin() ? "index.html" : "setup.html";
    const dashboardPath = path.join(frontendDir, "html", page);
    fs.access(dashboardPath, fs.constants.R_OK, (err) => {
      if (err) {
        next(err);
        return;
      }
      res.sendFile(dashboardPath);
    });
  });

  // Legacy frontend routes → consolidated Meeting Notes
  const legacyMeetkitPages = [
    "/html/map.html",
    "/html/meetings.html",
    "/html/whiteboard.html",
    "/html/meetkit-search.html",
    "/html/meetkit-admin.html",
  ];
  for (const p of legacyMeetkitPages) {
    app.get(p, (_req, res) => res.redirect(301, "/html/meeting-notes.html"));
  }

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      dbPath: process.env.DB_PATH || getDbPath(),
      nodeEnv: process.env.NODE_ENV || "development",
    });
  });

  app.use("/api/v1/setup", apiRateLimiter, setupRoutes);
  app.use("/api/v1/auth", apiRateLimiter, authRoutes);
  app.use("/api/v1/crm", apiRateLimiter, crmRoutes);
  app.use("/api/v1/fundraising", apiRateLimiter, fundraisingRoutes);
  app.use("/api/v1/finance", apiRateLimiter, financeRoutes);
  app.use("/api/v1/gl", apiRateLimiter, glRoutes);
  app.use("/api/v1/donations", apiRateLimiter, donationsRoutes);
  app.use("/api/v1/ar", apiRateLimiter, arRoutes);
  app.use("/api/v1/ap", apiRateLimiter, apRoutes);
  app.use("/api/v1/inventory", apiRateLimiter, inventoryRoutes);
  app.use("/api/v1/classes", apiRateLimiter, classesRoutes);
  app.use("/api/v1/periods", apiRateLimiter, periodsRoutes);
  app.use("/api/v1/bank", apiRateLimiter, bankRoutes);
  app.use("/api/v1/volunteers", apiRateLimiter, volunteerRoutes);
  app.use("/api/v1/events", apiRateLimiter, eventRoutes);
  app.use("/api/v1/communications", apiRateLimiter, communicationRoutes);
  app.use("/api/v1/reports", apiRateLimiter, reportRoutes);
  app.use("/api/v1/calendar", apiRateLimiter, calendarRoutes);
  app.use("/api/v1/dashboard", apiRateLimiter, dashboardRoutes);
  app.use("/api/v1/notes", apiRateLimiter, meetingNotesRoutes);
  app.use("/api/v1/settings", apiRateLimiter, settingsRoutes);
  app.use("/api/meetkit", apiRateLimiter, meetkitRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
