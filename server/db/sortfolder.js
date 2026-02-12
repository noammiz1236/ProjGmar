import fs from "fs";
import path from "path";
import { ParceStoreFile, parsePriceFile } from "./parser.js";
import { movetoprocess } from "./organizefiles.js";
export async function processAllFiles(folderPath) {
  const files = fs.readdirSync(folderPath);

  const storeFiles = files.filter(
    (f) => f.startsWith("Stores") && f.endsWith(".xml"),
  );

  for (const file of storeFiles) {
    const fullPath = path.join(folderPath, file);
    console.log(`${file}`);
    await ParceStoreFile(fullPath);
  }
  const priceFiles = files.filter(
    (f) =>
      (f.startsWith("Price") || f.startsWith("PriceFull")) &&
      f.endsWith(".xml"),
  );

  for (const file of priceFiles) {
    const fullPath = path.join(folderPath, file);

    let branchIdMatch = file.match(/-(\d{3})-\d{8}/);
    if (!branchIdMatch) {
      branchIdMatch = file.match(/-(\d+)-/);
    }

    const branchId = branchIdMatch ? branchIdMatch[1] : null;

    if (!branchId) {
      console.warn(`Skipped file with invalid name format: ${file}`);
      await movetoprocess(fullPath);
      continue;
    }

    console.log(`--- Processing prices for branch ${branchId}: ${file} ---`);
    await parsePriceFile(fullPath, branchId);
  }

  console.log("Finished scanning and processing all files!");
}
