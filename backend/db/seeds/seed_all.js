import { seedDatabase } from "../seed.js";
import { seedIntelligence } from "./seed_intelligence.js";

export function seedAll({ log = true } = {}) {
  seedDatabase({ log, throwOnError: true });
  seedIntelligence(undefined, { skipIfExisting: true });
  if (log) {
    console.log("All seeds complete.");
  }
}

const invokedFromCli = process.argv[1]?.includes("seed_all.js");

if (invokedFromCli) {
  seedAll({ log: true });
}
