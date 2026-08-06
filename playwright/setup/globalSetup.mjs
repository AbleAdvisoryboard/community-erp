import { execSync } from "node:child_process";

export default async function globalSetup() {
  execSync("npm run db:migrate -- --reset", { stdio: "inherit" });
  execSync("npm run db:seed", { stdio: "inherit" });
}
