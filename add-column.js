const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://smartcart:smartcart123@localhost:5432/smartcart',
});

async function addColumn() {
  try {
    console.log('Adding note_by column to app.list_items...');
    await pool.query('ALTER TABLE app.list_items ADD COLUMN IF NOT EXISTS note_by INT');
    console.log('✅ SUCCESS: Column added!');
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    await pool.end();
    process.exit(1);
  }
}

addColumn();
