/* eslint-disable n/no-unpublished-require */
const { app, BrowserWindow, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let server;
let mainWindow;
let logFile;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function log(message, detail) {
  const line = `[${new Date().toISOString()}] ${message}${detail ? ` ${detail}` : ""}\n`;
  process.stdout.write(line);
  if (logFile) {
    fs.appendFileSync(logFile, line);
  }
}

function ensureSecret(name) {
  if (!process.env[name]) {
    process.env[name] = crypto.randomBytes(48).toString("base64url");
  }
}

function configureRuntime() {
  app.setName("Community ERP");
  app.setPath("userData", path.join(app.getPath("appData"), "Community ERP"));
  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  const logDir = path.join(userData, "logs");
  const uploadsDir = path.join(userData, "uploads");
  ensureDir(dataDir);
  ensureDir(logDir);
  ensureDir(uploadsDir);
  logFile = path.join(logDir, "startup.log");

  process.env.NODE_ENV = process.env.NODE_ENV || "production";
  process.env.PORT = "0";
  process.env.DB_PATH = path.join(dataDir, "community-erp.db");
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.SECURE_COOKIES = "false";
  delete process.env.COOKIE_DOMAIN;
  ensureSecret("JWT_SECRET");
  ensureSecret("REFRESH_TOKEN_SECRET");

  log("Starting Community ERP desktop app");
  log("Database", process.env.DB_PATH);
  log("Startup log", logFile);
}

async function startServer() {
  const { createApp } = await import("../backend/app.js");
  const expressApp = createApp({
    loadEnv: false,
    runMigrations: true,
    initializeDb: true,
  });
  return new Promise((resolve, reject) => {
    server = expressApp.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}`;
      log("Server listening", url);
      resolve(url);
    });
    server.on("error", reject);
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "Community ERP",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  mainWindow.loadURL(url);
}

async function bootstrap() {
  configureRuntime();
  const url = await startServer();
  createWindow(url);
}

app.whenReady().then(bootstrap).catch((error) => {
  log("Failed to start", error.stack || error.message);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (server) {
    server.close();
    server = null;
  }
});
