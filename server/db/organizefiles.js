import path from "path";
import { rename, mkdir } from "fs/promises";

export async function movetoprocess(filepath) {
  try {
    const filename = path.basename(filepath);

    const dirname = path.dirname(filepath);

    const process = path.join(dirname, "process");

    const targetPath = path.join(process, filename);

    await mkdir(process, { recursive: true });

    await rename(filepath, targetPath);
    
    console.log(`good ${filename}`);
  } catch (e) {
    console.error(e);
  }
}
