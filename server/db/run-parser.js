import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { processAllFiles } from "./sortfolder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pricesRoot = path.resolve(__dirname, "../../my_prices");

async function main() {
  if (!fs.existsSync(pricesRoot)) {
    console.error(`Prices folder not found: ${pricesRoot}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(pricesRoot, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory() && e.name !== "status");

  console.log(`Found ${folders.length} chain folders to process`);

  for (const folder of folders) {
    const folderPath = path.join(pricesRoot, folder.name);
    console.log(`\n=== Processing chain: ${folder.name} ===`);
    try {
      await processAllFiles(folderPath);
    } catch (err) {
      console.error(`Error processing ${folder.name}:`, err.message);
    }
  }

  console.log("\nAll chains processed! Exiting.");
  process.exit(0);
}

main();
