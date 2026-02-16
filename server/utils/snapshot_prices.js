import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Snapshot current prices into price_history table
 * Run this daily via cron job
 */
async function snapshotPrices() {
  try {
    console.log('[Price Snapshot] Starting daily price snapshot...');
    
    // Insert current prices from app.prices into app.price_history
    const result = await db.query(`
      INSERT INTO app.price_history (product_id, chain_id, price, recorded_at)
      SELECT 
        p.item_id as product_id,
        b.chain_id,
        p.price,
        NOW() as recorded_at
      FROM app.prices p
      JOIN app.branches b ON b.id = p.branch_id
      WHERE p.price IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const count = result.rowCount || 0;
    console.log(`[Price Snapshot] ✅ Inserted ${count} price records`);

    // Clean up old records (keep last 90 days only)
    const cleanupResult = await db.query(`
      DELETE FROM app.price_history
      WHERE recorded_at < NOW() - INTERVAL '90 days'
      RETURNING id
    `);

    const cleaned = cleanupResult.rowCount || 0;
    console.log(`[Price Snapshot] 🧹 Cleaned up ${cleaned} old records (>90 days)`);

    return { inserted: count, cleaned };
  } catch (err) {
    console.error('[Price Snapshot] ❌ Error:', err.message);
    throw err;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  snapshotPrices()
    .then(({ inserted, cleaned }) => {
      console.log(`[Price Snapshot] Done! Inserted: ${inserted}, Cleaned: ${cleaned}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[Price Snapshot] Fatal error:', err);
      process.exit(1);
    });
}

export default snapshotPrices;
