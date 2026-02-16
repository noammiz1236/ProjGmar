import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/search
 * Search products by name
 */
router.get("/search", async (req, res) => {
  const search = req.query.q;
  const db = req.app.locals.db;

  if (!search) {
    return res.json([]);
  }

  try {
    const searchTerm = `%${search}%`;
    const reply = await db.query(
      `SELECT DISTINCT ON (i.id)
       i.id as item_id,
       i.name as item_name,
       i.barcode,
       i.item_code,
       i.image_url,
       p.price,
       c.id as chain_id,
       c.name as chain_name,
       b.branch_name
       FROM app.items i
       LEFT JOIN app.prices p ON p.item_id = i.id
       LEFT JOIN app.branches b ON b.id = p.branch_id
       LEFT JOIN app.chains c ON c.id = b.chain_id
       WHERE i.name ILIKE $1
       ORDER BY i.id, p.price DESC NULLS LAST
       LIMIT 15`,
      [searchTerm]
    );
    res.json(reply.rows);
  } catch (e) {
    console.error("Search error:", e.message);
    return res.status(500).json([]);
  }
});

/**
 * GET /api/items/barcode/:barcode
 * Lookup product by barcode
 */
router.get("/items/barcode/:barcode", async (req, res) => {
  const { barcode } = req.params;
  const db = req.app.locals.db;

  if (!barcode) {
    return res.json({ item: null });
  }

  try {
    const itemResult = await db.query(
      `SELECT id, name, barcode, item_code, image_url FROM app.items WHERE barcode = $1 LIMIT 1`,
      [barcode]
    );

    if (itemResult.rows.length === 0) {
      return res.json({ item: null });
    }

    const item = itemResult.rows[0];
    const pricesResult = await db.query(
      `SELECT p.price, c.name as chain_name, b.branch_name
       FROM app.prices p
       JOIN app.branches b ON b.id = p.branch_id
       JOIN app.chains c ON c.id = b.chain_id
       WHERE p.item_id = $1
       ORDER BY p.price ASC`,
      [item.id]
    );

    return res.json({ item, prices: pricesResult.rows });
  } catch (e) {
    console.error("Barcode lookup error:", e.message);
    return res.status(500).json({ item: null });
  }
});

/**
 * GET /api/suggestions
 * Get frequently bought items for user
 */
router.get("/suggestions", authenticateToken, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const result = await db.query(
      `SELECT itemname, COUNT(*) as freq, MAX(price) as price, MAX(quantity) as quantity
       FROM app.list_items li
       JOIN app.list_members lm ON lm.list_id = li.listid
       WHERE lm.user_id = $1
       GROUP BY itemname
       ORDER BY freq DESC
       LIMIT 10`,
      [req.userId]
    );
    return res.json(result.rows);
  } catch (e) {
    console.error("Suggestions error:", e.message);
    return res.status(500).json([]);
  }
});

/**
 * GET /api/products/:id/price-history
 * Price history for a product
 */
router.get("/products/:id/price-history", authenticateToken, async (req, res) => {
  const itemId = req.params.id;
  const db = req.app.locals.db;

  try {
    const result = await db.query(
      `SELECT p.price, p.updated_at, c.name as chain_name, b.branch_name
       FROM app.prices p
       JOIN app.branches b ON b.id = p.branch_id
       JOIN app.chains c ON c.id = b.chain_id
       WHERE p.item_id = $1
       ORDER BY p.updated_at DESC`,
      [itemId]
    );
    return res.json({ priceHistory: result.rows });
  } catch (err) {
    console.error("Error fetching price history:", err);
    return res.status(500).json({ message: "Error fetching price history" });
  }
});

/**
 * GET /api/predict-quantity/:itemName
 * Smart quantity prediction based on past orders
 */
router.get("/predict-quantity/:itemName", authenticateToken, async (req, res) => {
  const itemName = decodeURIComponent(req.params.itemName);
  const db = req.app.locals.db;

  try {
    const result = await db.query(
      `SELECT quantity FROM app.list_items li
       JOIN app.list_members lm ON lm.list_id = li.listid
       WHERE lm.user_id = $1 AND li.itemname ILIKE $2`,
      [req.userId, itemName]
    );

    if (result.rows.length === 0) {
      return res.json({ suggestedQuantity: 1, avgQuantity: 1, timesOrdered: 0 });
    }

    const quantities = result.rows.map((r) => parseFloat(r.quantity) || 1);
    const avg = quantities.reduce((a, b) => a + b, 0) / quantities.length;
    const suggested = Math.round(avg);

    return res.json({
      suggestedQuantity: suggested || 1,
      avgQuantity: parseFloat(avg.toFixed(2)),
      timesOrdered: quantities.length,
    });
  } catch (err) {
    console.error("Error predicting quantity:", err);
    return res.status(500).json({ message: "Error predicting quantity" });
  }
});

/**
 * GET /api/delivery/providers
 * Get delivery provider links
 */
router.get("/delivery/providers", authenticateToken, (req, res) => {
  const DELIVERY_PROVIDERS = [
    { id: 1, chain_name: 'רמי לוי', website_url: 'https://www.rami-levy.co.il/he/online', icon: 'cart-outline' },
    { id: 2, chain_name: 'שופרסל', website_url: 'https://www.shufersal.co.il/online/he/default', icon: 'storefront-outline' },
    { id: 3, chain_name: 'יוחננוף', website_url: 'https://yochananof.co.il/', icon: 'basket-outline' },
    { id: 4, chain_name: 'ויקטורי', website_url: 'https://www.victoryonline.co.il/', icon: 'bag-outline' },
    { id: 5, chain_name: 'אושר עד', website_url: 'https://osherad.co.il/', icon: 'pricetag-outline' },
  ];
  res.json({ providers: DELIVERY_PROVIDERS });
});

export default router;
