import XmlStream from "xml-stream-saxjs";
import fs from "fs";
import { config } from "dotenv";
import pg from "pg";
import iconv from "iconv-lite";
import { movetoprocess } from "./organizefiles.js";
config();

const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const getText = (node) =>
  (typeof node === "string" ? node : node?.$text || "").trim();

export async function ParceStoreFile(xmlpath) {
  return new Promise((resolve, reject) => {
    const rawStream = fs
      .createReadStream(xmlpath)
      .pipe(iconv.decodeStream("utf16le"))
      .pipe(iconv.encodeStream("utf8"));
    const xmlStream = new XmlStream(rawStream);

    let currentChainId = null;
    let currentSubChainId = null;

    console.log(` Starting store file parsing: ${xmlpath}`);

    xmlStream.on("endElement: ChainID", (node) => {
      currentChainId = getText(node);
      console.log(` Captured ChainID: ${currentChainId}`);
    });

    xmlStream.on("endElement: ChainName", async (node) => {
      rawStream.pause();
      const chainName = getText(node);
      console.log(` Captured ChainName: ${chainName}`);
      try {
        await db.query(
          "INSERT INTO app.chains (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
          [currentChainId, chainName],
        );
      } catch (e) {
        console.error("Error updating chain:", e.message);
      } finally {
        rawStream.resume();
      }
    });

    xmlStream.on("endElement: SubChainID", (node) => {
      currentSubChainId = getText(node);
      console.log(` Captured SubChainID: ${currentSubChainId}`);
    });

    xmlStream.on("endElement: SubChainName", async (node) => {
      rawStream.pause();
      const subChainName = getText(node);
      console.log(` Captured SubChainName: ${subChainName}`);
      try {
        await db.query(
          "INSERT INTO app.sub_chains (id, chain_id, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
          [currentSubChainId, currentChainId, subChainName],
        );
      } catch (e) {
        console.error("Error inserting sub-chain:", e.message);
      } finally {
        rawStream.resume();
      }
    });

    xmlStream.on("endElement: Store", async (store) => {
      rawStream.pause();
      try {
        await db.query(
          "INSERT INTO app.branches (id, chain_id, sub_chain_id, branch_name, address, city) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
          [
            getText(store.StoreID),
            currentChainId,
            currentSubChainId,
            getText(store.StoreName),
            getText(store.Address),
            getText(store.City),
          ],
        );
      } catch (e) {
        console.error(
          `Error inserting branch ${getText(store.StoreID)}:`,
          e.message,
        );
      } finally {
        rawStream.resume();
      }
    });

    xmlStream.on("end", async () => {
      console.log(" Finished processing branches file.");
      await movetoprocess(xmlpath);
      resolve();
    });

    xmlStream.on("error", (err) => reject(err));
  });
}

export async function parsePriceFile(xmlPath, branchId) {
  // Check if branch exists in the database to prevent foreign key errors
  try {
    const branchCheck = await db.query(
      "SELECT 1 FROM app.branches WHERE id = $1",
      [branchId],
    );
    if (branchCheck.rowCount === 0) {
      console.warn(
        `Branch ${branchId} does not exist in database. Skipping price file ${xmlPath}`,
      );
      await movetoprocess(xmlPath);
      return;
    }
  } catch (e) {
    console.error(
      `Error checking branch existence for ${branchId}:`,
      e.message,
    );
    return;
  }

  return new Promise((resolve, reject) => {
    const rawStream = fs.createReadStream(xmlPath);
    const xmlStream = new XmlStream(rawStream);
    console.log(` Starting price extraction for branch ${branchId}`);

    xmlStream.on("endElement: Item", async (item) => {
      rawStream.pause();
      try {
        const itemCode = getText(item.ItemCode);
        const itemName = getText(item.ItemName);
        const price = parseFloat(item.ItemPrice);
        const manufacturer = getText(item.ManufacturerName) || "לא ידוע";
        const unitQty = parseFloat(item.UnitQty) || "1";

        const sqlQuery = `
          WITH ins_item AS (
            INSERT INTO app.items (barcode, item_code, name, manufacturer, unit_qty)
            VALUES ($1, $1, $2, $3, $4)
            ON CONFLICT (item_code, manufacturer, is_weighted) DO UPDATE SET 
              name = EXCLUDED.name,
              unit_qty = EXCLUDED.unit_qty
            RETURNING id
          )
          INSERT INTO app.prices (item_id, branch_id, price, price_update_time)
          SELECT id, $5, $6, NOW() FROM ins_item
          ON CONFLICT (item_id, branch_id) DO UPDATE SET 
            price = EXCLUDED.price, 
            price_update_time = NOW();
        `;
        await db.query(sqlQuery, [
          itemCode,
          itemName,
          manufacturer,
          unitQty,
          branchId,
          price,
        ]);
      } catch (err) {
        console.error(` Error in item ${getText(item.ItemCode)}:`, err.message);
      } finally {
        rawStream.resume();
      }
    });

    xmlStream.on("end", async () => {
      console.log(
        ` Price update for branch ${branchId} completed successfully!`,
      );
      await movetoprocess(xmlPath);
      resolve();
    });

    xmlStream.on("error", (err) => {
      console.error("Critical error in Parser:", err);
      reject(err);
    });
  });
}
