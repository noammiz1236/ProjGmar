// import-prices.js - Standalone script to import prices into database
import { processAllFiles } from "./db/sortfolder.js";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MY_PRICES_DIR = path.join(__dirname, "my_prices");

console.log("=== Starting Price Import Process ===");
console.log(`Processing files from: ${MY_PRICES_DIR}`);

try {
  await processAllFiles(MY_PRICES_DIR);
  console.log("=== Price Import Completed Successfully ===");
  process.exit(0);
} catch (error) {
  console.error("=== Price Import Failed ===");
  console.error(error);
  process.exit(1);
}
