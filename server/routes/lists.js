import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

/**
 * Helper: Log activity for a list
 */
async function logActivity(db, listId, userId, action, details) {
  try {
    await db.query(
      `INSERT INTO app.activity_log (list_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
      [listId, userId, action, details]
    );
  } catch (err) {
    console.error("Error logging activity:", err);
  }
}

/**
 * GET /api/lists
 * Get all lists for authenticated user
 */
router.get("/", authenticateToken, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { rows } = await db.query(
      `SELECT l.id, l.list_name, l.status, l.created_at, l.updated_at, lm.status AS role
       FROM app.list l
       JOIN app.list_members lm ON lm.list_id = l.id
       WHERE lm.user_id = $1
       ORDER BY l.updated_at DESC`,
      [req.userId]
    );
    return res.json({ lists: rows });
  } catch (err) {
    console.error("Error fetching lists:", err);
    return res.status(500).json({ message: "Error fetching lists" });
  }
});

/**
 * GET /api/lists/:id/items
 * Get list details + items + members + user role
 */
router.get("/:id/items", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const db = req.app.locals.db;

  try {
    // Check membership
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    const listRes = await db.query("SELECT * FROM app.list WHERE id = $1", [listId]);
    if (listRes.rows.length === 0) {
      return res.status(404).json({ message: "List not found" });
    }

    const itemsRes = await db.query(
      `SELECT li.*, u.first_name AS paid_by_name, u2.first_name AS note_by_name,
              u3.first_name AS added_by_name, u4.first_name AS checked_by_name,
              u5.first_name AS assigned_to_name
       FROM app.list_items li
       LEFT JOIN app2.users u ON li.paid_by = u.id
       LEFT JOIN app2.users u2 ON li.note_by = u2.id
       LEFT JOIN app2.users u3 ON li.addby = u3.id
       LEFT JOIN app2.users u4 ON li.checked_by = u4.id
       LEFT JOIN app2.users u5 ON li.assigned_to = u5.id
       WHERE li.listid = $1
       ORDER BY CASE WHEN li.sort_order > 0 THEN li.sort_order ELSE 999999 END ASC, li.addat DESC`,
      [listId]
    );

    const membersRes = await db.query(
      `SELECT u.id, u.first_name, u.last_name, lm.status AS role
       FROM app.list_members lm
       JOIN app2.users u ON lm.user_id = u.id
       WHERE lm.list_id = $1`,
      [listId]
    );

    return res.json({
      list: listRes.rows[0],
      items: itemsRes.rows,
      members: membersRes.rows,
      userRole: membership.rows[0].status,
    });
  } catch (err) {
    console.error("Error fetching list details:", err);
    return res.status(500).json({ message: "Error fetching list details" });
  }
});

/**
 * POST /api/lists/:id/items
 * Add item to list
 */
router.post("/:id/items", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const { itemName, price, storeName, quantity, productId } = req.body;
  const db = req.app.locals.db;

  if (!itemName || itemName.trim() === "") {
    return res.status(400).json({ message: "Item name is required" });
  }

  try {
    const membership = await db.query(
      "SELECT id FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    const result = await db.query(
      `INSERT INTO app.list_items (listId, itemName, price, storeName, quantity, addby, addat, updatedat, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)
       RETURNING *`,
      [listId, itemName, price || null, storeName || null, quantity || 1, req.userId, productId || null]
    );

    const newItem = result.rows[0];

    // Emit real-time update via Socket.io
    const io = req.app.locals.io;
    if (io) {
      io.to(String(listId)).emit("receive_item", newItem);
    }

    // Log activity
    await logActivity(db, listId, req.userId, "item_added", `Added item: ${itemName}`);

    return res.status(201).json({ item: newItem });
  } catch (err) {
    console.error("Error adding item to list:", err);
    return res.status(500).json({ message: "Error adding item", error: err.message });
  }
});

/**
 * DELETE /api/lists/:id
 * Delete a list (admin only)
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const db = req.app.locals.db;

  try {
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    if (membership.rows[0].status !== "admin") {
      return res.status(403).json({ message: "Only admin can delete the list" });
    }

    await db.query("DELETE FROM app.list WHERE id = $1", [listId]);

    return res.json({ success: true, message: "List deleted successfully" });
  } catch (err) {
    console.error("Error deleting list:", err);
    return res.status(500).json({ message: "Error deleting list" });
  }
});

/**
 * POST /api/lists/:id/leave
 * Leave a list (members only, not admin)
 */
router.post("/:id/leave", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const db = req.app.locals.db;

  try {
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    if (membership.rows[0].status === "admin") {
      return res.status(403).json({
        message: "Admin cannot leave the list. Delete it or transfer admin role first.",
      });
    }

    await db.query(
      "DELETE FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId]
    );

    return res.json({ success: true, message: "Left list successfully" });
  } catch (err) {
    console.error("Error leaving list:", err);
    return res.status(500).json({ message: "Error leaving list" });
  }
});

/**
 * GET /api/lists/:id/compare
 * Price comparison across chains
 */
router.get("/:id/compare", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const db = req.app.locals.db;

  try {
    const itemsRes = await db.query(
      `SELECT li.id, li.itemname, li.quantity, li.product_id, li.price AS user_price
       FROM app.list_items li
       WHERE li.listid = $1`,
      [listId]
    );
    const allItems = itemsRes.rows;

    if (allItems.length === 0) {
      return res.json({ chains: [], bestMix: null, totalItems: 0 });
    }

    const linkedItems = allItems.filter((i) => i.product_id);
    const unlinkedItems = allItems.filter((i) => !i.product_id);
    const productIds = linkedItems.map((i) => i.product_id);

    let priceRows = [];
    if (productIds.length > 0) {
      const pricesRes = await db.query(
        `SELECT DISTINCT ON (c.id, p.item_id)
                c.id AS chain_id, c.name AS chain_name,
                p.item_id AS product_id, p.price
         FROM app.prices p
         JOIN app.branches b ON p.branch_id = b.id
         JOIN app.chains c ON b.chain_id = c.id
         WHERE p.item_id = ANY($1)
         ORDER BY c.id, p.item_id, p.price ASC`,
        [productIds]
      );
      priceRows = pricesRes.rows;
    }

    let nameMatchRows = [];
    if (unlinkedItems.length > 0) {
      const namePatterns = unlinkedItems.map((i) => `%${i.itemname}%`);
      const placeholders = namePatterns.map((_, idx) => `i.name ILIKE $${idx + 1}`).join(" OR ");

      if (placeholders) {
        try {
          const fuzzyRes = await db.query(
            `SELECT DISTINCT ON (c.id, i.id)
                    c.id AS chain_id, c.name AS chain_name,
                    i.id AS product_id, i.name AS product_name, p.price
             FROM app.prices p
             JOIN app.items i ON p.item_id = i.id
             JOIN app.branches b ON p.branch_id = b.id
             JOIN app.chains c ON b.chain_id = c.id
             WHERE ${placeholders}
             ORDER BY c.id, i.id, p.price ASC`,
            namePatterns
          );
          nameMatchRows = fuzzyRes.rows;
        } catch (e) {
          console.error("Fuzzy name matching error:", e);
        }
      }
    }

    const nameToProduct = {};
    for (const row of nameMatchRows) {
      for (const item of unlinkedItems) {
        if (row.product_name && row.product_name.toLowerCase().includes(item.itemname.toLowerCase())) {
          if (!nameToProduct[item.id]) {
            nameToProduct[item.id] = row.product_id;
          }
        }
      }
    }

    const matchableItems = [
      ...linkedItems,
      ...unlinkedItems.filter((i) => nameToProduct[i.id]).map((i) => ({
        ...i,
        product_id: nameToProduct[i.id],
      })),
    ];
    const unmatchedItems = unlinkedItems.filter((i) => !nameToProduct[i.id]);
    const allPriceRows = [...priceRows, ...nameMatchRows];

    const chainMap = {};
    for (const row of allPriceRows) {
      if (!chainMap[row.chain_id]) {
        chainMap[row.chain_id] = {
          chain_id: row.chain_id,
          chain_name: row.chain_name,
          prices: {},
        };
      }
      const pid = row.product_id;
      const price = parseFloat(row.price);
      if (!chainMap[row.chain_id].prices[pid] || price < chainMap[row.chain_id].prices[pid]) {
        chainMap[row.chain_id].prices[pid] = price;
      }
    }

    const chains = Object.values(chainMap).map((chain) => {
      let total = 0;
      const missing = [];
      const items = matchableItems.map((li) => {
        const price = chain.prices[li.product_id];
        const qty = parseFloat(li.quantity) || 1;
        if (price !== undefined) {
          const subtotal = price * qty;
          total += subtotal;
          return { item_name: li.itemname, price, quantity: qty, subtotal, available: true };
        } else {
          missing.push(li.itemname);
          return { item_name: li.itemname, price: 0, quantity: qty, subtotal: 0, available: false };
        }
      });
      return {
        chain_id: chain.chain_id,
        chain_name: chain.chain_name,
        total,
        items: items.filter((i) => i.available),
        missing,
        missingCount: missing.length,
        itemCount: items.filter((i) => i.available).length,
      };
    });

    chains.sort((a, b) => a.total - b.total);

    const cheapest = chains.length > 0 ? { chain_name: chains[0].chain_name, total: chains[0].total } : null;
    const mostExpensive = chains.length > 1 ? chains[chains.length - 1].total : null;

    const bestMixItems = [];
    let bestMixTotal = 0;
    const bestMixStores = new Set();
    for (const li of matchableItems) {
      let bestPrice = Infinity;
      let bestChain = null;
      for (const chain of Object.values(chainMap)) {
        const p = chain.prices[li.product_id];
        if (p !== undefined && p < bestPrice) {
          bestPrice = p;
          bestChain = chain.chain_name;
        }
      }
      const qty = parseFloat(li.quantity) || 1;
      if (bestChain) {
        bestMixItems.push({ item_name: li.itemname, price: bestPrice, quantity: qty, subtotal: bestPrice * qty, store: bestChain });
        bestMixTotal += bestPrice * qty;
        bestMixStores.add(bestChain);
      }
    }

    const bestMix = bestMixItems.length > 0 ? {
      total: bestMixTotal,
      items: bestMixItems,
      storeCount: bestMixStores.size,
      stores: [...bestMixStores],
    } : null;

    const savings = cheapest && mostExpensive ? mostExpensive - cheapest.total : 0;
    const bestMixSavings = bestMix && mostExpensive ? mostExpensive - bestMix.total : 0;

    return res.json({
      chains,
      cheapest,
      bestMix,
      totalItems: allItems.length,
      matchedItems: matchableItems.length,
      unmatchedItems: unmatchedItems.length,
      savings: parseFloat(savings.toFixed(2)),
      bestMixSavings: parseFloat(bestMixSavings.toFixed(2)),
    });
  } catch (err) {
    console.error("Error comparing prices:", err);
    return res.status(500).json({ message: "Error comparing prices" });
  }
});

/**
 * POST /api/lists/:id/invite
 * Generate invite link
 */
router.post("/:id/invite", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const db = req.app.locals.db;

  try {
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId]
    );

    if (membership.rows.length === 0 || membership.rows[0].status !== "admin") {
      return res.status(403).json({ message: "Only admins can create invites" });
    }

    const crypto = await import("crypto");
    const inviteCode = crypto.randomBytes(16).toString("hex");

    await db.query(
      `INSERT INTO app.list_invites (list_id, invite_code, created_by, expires_at)
       VALUES ($1, $2, $3, NOW() + interval '7 days')`,
      [listId, inviteCode, req.userId]
    );

    const host = process.env.host_allowed?.split(",")[0] || "http://localhost:5173";
    return res.json({ inviteLink: `${host}/invite/${inviteCode}` });
  } catch (err) {
    console.error("Error creating invite:", err);
    return res.status(500).json({ message: "Error creating invite" });
  }
});

/**
 * GET /api/lists/:id/chat
 * Get chat messages for a list
 */
router.get("/:id/chat", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const db = req.app.locals.db;

  try {
    const result = await db.query(
      `SELECT lc.id, lc.list_id AS "listId", lc.user_id AS "userId", u.first_name AS "firstName",
              lc.message, lc.created_at AS "createdAt"
       FROM app.list_chat lc
       JOIN app2.users u ON lc.user_id = u.id
       WHERE lc.list_id = $1
       ORDER BY lc.created_at DESC
       LIMIT 50`,
      [listId]
    );
    return res.json({ messages: result.rows.reverse() });
  } catch (err) {
    console.error("Error fetching chat messages:", err);
    return res.status(500).json({ message: "Error fetching chat messages" });
  }
});

/**
 * GET /api/lists/:id/activity
 * Get activity log for a list
 */
router.get("/:id/activity", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const db = req.app.locals.db;

  try {
    const result = await db.query(
      `SELECT al.id, al.list_id, al.user_id, al.action, al.details, al.created_at,
              u.first_name
       FROM app.activity_log al
       LEFT JOIN app2.users u ON al.user_id = u.id
       WHERE al.list_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [listId]
    );
    return res.json({ activities: result.rows });
  } catch (err) {
    console.error("Error fetching activity log:", err);
    return res.status(500).json({ message: "Error fetching activity log" });
  }
});

/**
 * PUT /api/lists/:id/reorder
 * Reorder list items
 */
router.put("/:id/reorder", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const { items } = req.body;
  const db = req.app.locals.db;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: "items array is required" });
  }

  try {
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const item of items) {
        await client.query(
          "UPDATE app.list_items SET sort_order = $1 WHERE id = $2 AND listid = $3",
          [item.sortOrder, item.itemId, listId]
        );
      }
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error reordering items:", err);
    return res.status(500).json({ message: "Error reordering items" });
  }
});

/**
 * GET /api/lists/:listId/items/:itemId/comments
 * Get comments for an item
 */
router.get("/:listId/items/:itemId/comments", authenticateToken, async (req, res) => {
  const { itemId } = req.params;
  const db = req.app.locals.db;

  try {
    const result = await db.query(
      `SELECT c.id, c.item_id, c.user_id, c.comment, c.created_at, u.first_name
       FROM app.list_item_comments c
       JOIN app2.users u ON c.user_id = u.id
       WHERE c.item_id = $1
       ORDER BY c.created_at ASC`,
      [itemId]
    );

    res.json({ comments: result.rows });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ message: "Error fetching comments" });
  }
});

export default router;
