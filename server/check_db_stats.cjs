const { Pool } = require('pg');

const pool = new Pool({
  user: 'smartcart',
  host: 'localhost',
  database: 'smartcart',
  password: 'smartcart123',
  port: 5432,
});

async function checkStats() {
  try {
    console.log('\n=== SmartCart Database Stats ===\n');
    
    // Check chains
    const chainsResult = await pool.query('SELECT COUNT(*) FROM app.chains');
    console.log(`Total chains: ${chainsResult.rows[0].count}`);
    
    // Check branches
    const branchesResult = await pool.query('SELECT COUNT(*) FROM app.branches');
    console.log(`Total branches: ${branchesResult.rows[0].count}`);
    
    // Check items (products)
    const itemsResult = await pool.query('SELECT COUNT(*) FROM app.items');
    console.log(`Total items/products: ${itemsResult.rows[0].count}`);
    
    // Check prices
    const pricesResult = await pool.query('SELECT COUNT(*) FROM app.prices');
    console.log(`Total price records: ${pricesResult.rows[0].count}`);
    
    // Top chains by item count
    const topChainsResult = await pool.query(`
      SELECT c.chain_name, COUNT(DISTINCT i.item_code) as item_count
      FROM app.chains c
      LEFT JOIN app.items i ON c.chain_id = i.chain_id
      GROUP BY c.chain_id, c.chain_name
      ORDER BY item_count DESC
      LIMIT 10
    `);
    console.log('\nTop chains by unique items:');
    topChainsResult.rows.forEach(row => {
      console.log(`  ${row.chain_name}: ${row.item_count} items`);
    });
    
    // Check last update time
    const lastUpdate = await pool.query(
      'SELECT MAX(update_date) as last_update FROM app.prices'
    );
    console.log('\nLast price update:', lastUpdate.rows[0].last_update);
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkStats();
