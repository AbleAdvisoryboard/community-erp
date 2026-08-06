import { createApp } from "./app.js";
import { getDbPath } from "./db/connection.js";

function bootstrap() {
  const app = createApp();
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const dbPath = process.env.DB_PATH || getDbPath();
  console.log("[DB]", dbPath);
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

try {
  bootstrap();
} catch (err) {
  console.error("Failed to start server:", err);
  process.exitCode = 1;
}
